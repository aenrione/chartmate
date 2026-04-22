use base64::{engine::general_purpose, Engine as _};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use reqwest::{header, Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use tokio::fs;

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncManifest {
    pub schema_version: u32,
    pub exported_at: String,
    pub device_id: String,
    pub export_hash: String,
    pub app_version: String,
    pub full_sync: bool,
}

#[derive(Debug, Serialize)]
pub struct RemotePdfEntry {
    pub relative_path: String,
    pub content_length: Option<u64>,
    pub last_modified: Option<String>,
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn make_client() -> Result<Client, String> {
    Client::builder().build().map_err(|e| e.to_string())
}

fn basic_auth(username: &str, password: &str) -> String {
    format!(
        "Basic {}",
        general_purpose::STANDARD.encode(format!("{}:{}", username, password))
    )
}

fn ensure_trailing_slash(url: &str) -> String {
    if url.ends_with('/') {
        url.to_string()
    } else {
        format!("{}/", url)
    }
}

/// MKCOL — treats 201 (created) and 405 (already exists) as success.
async fn ensure_collection(client: &Client, auth: &str, url: &str) -> Result<(), String> {
    let method = reqwest::Method::from_bytes(b"MKCOL").map_err(|e| e.to_string())?;
    let resp = client
        .request(method, url)
        .header(header::AUTHORIZATION, auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let s = resp.status();
    if s == StatusCode::CREATED || s == StatusCode::METHOD_NOT_ALLOWED {
        Ok(())
    } else {
        Err(format!("MKCOL failed ({}) at {}", s, url))
    }
}

/// Extract the text content of the first element with the given local name.
fn extract_xml_text(xml: &str, local_name: &[u8]) -> Option<String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    let mut in_target = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                in_target = e.local_name().as_ref() == local_name;
            }
            Ok(Event::Text(e)) if in_target => {
                if let Ok(t) = e.unescape() {
                    let s = t.trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {
                if !matches!(
                    reader.read_event_into(&mut buf),
                    Ok(quick_xml::events::Event::Text(_))
                ) {
                    in_target = false;
                }
            }
        }
        buf.clear();
    }
    None
}

/// Parse a WebDAV PROPFIND multistatus body into file entries.
/// Skips collection (directory) entries.
fn parse_propfind_entries(xml: &str, base_path: &str) -> Vec<RemotePdfEntry> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    let mut entries = Vec::new();

    let mut current_href: Option<String> = None;
    let mut current_length: Option<u64> = None;
    let mut current_modified: Option<String> = None;
    let mut in_tag: Option<Vec<u8>> = None;
    let mut is_collection = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = e.local_name().as_ref().to_vec();
                match local.as_slice() {
                    b"response" => {
                        current_href = None;
                        current_length = None;
                        current_modified = None;
                        is_collection = false;
                    }
                    b"href" | b"getcontentlength" | b"getlastmodified" => {
                        in_tag = Some(local);
                    }
                    b"collection" => {
                        is_collection = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if let (Some(tag), Ok(text)) = (&in_tag, e.unescape()) {
                    let text = text.trim().to_string();
                    match tag.as_slice() {
                        b"href" => current_href = Some(text),
                        b"getcontentlength" => current_length = text.parse().ok(),
                        b"getlastmodified" => current_modified = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.local_name().as_ref() == b"response" {
                    if let Some(href) = current_href.take() {
                        if !is_collection {
                            let rel = href
                                .strip_prefix(base_path)
                                .unwrap_or(&href)
                                .trim_start_matches('/')
                                .to_string();
                            if !rel.is_empty() {
                                entries.push(RemotePdfEntry {
                                    relative_path: rel,
                                    content_length: current_length.take(),
                                    last_modified: current_modified.take(),
                                });
                            }
                        }
                    }
                    is_collection = false;
                    in_tag = None;
                } else if in_tag.as_deref() == Some(e.local_name().as_ref()) {
                    in_tag = None;
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    entries
}

const PROPFIND_ALLPROP: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>"#;

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Test connectivity — returns the server display name on success.
#[tauri::command]
pub async fn webdav_test_connection(
    url: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);
    let method = reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;

    let resp = client
        .request(method, &root)
        .header(header::AUTHORIZATION, &auth)
        .header("Depth", "0")
        .header(header::CONTENT_TYPE, "application/xml")
        .body(PROPFIND_ALLPROP)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if resp.status() == StatusCode::UNAUTHORIZED {
        return Err("Invalid credentials".into());
    }
    if resp.status().as_u16() != 207 && !resp.status().is_success() {
        return Err(format!("Server returned {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let display_name = extract_xml_text(&body, b"displayname").unwrap_or(url);
    Ok(display_name)
}

/// Fetch the remote manifest without downloading the full export.
/// Returns None if no export exists yet (first push).
#[tauri::command]
pub async fn webdav_get_remote_manifest(
    url: String,
    username: String,
    password: String,
) -> Result<Option<SyncManifest>, String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);
    let manifest_url = format!("{}chartmate/manifest.json", root);

    let resp = client
        .get(&manifest_url)
        .header(header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("Failed to fetch manifest: {}", resp.status()));
    }

    let manifest: SyncManifest = resp.json().await.map_err(|e| e.to_string())?;
    Ok(Some(manifest))
}

/// Gzip-compress the JSON export and upload to WebDAV.
/// Uploads db_export.json.gz first, then manifest.json (manifest appears last
/// so a crash mid-upload never leaves an inconsistent state).
/// Returns the ETag of the newly uploaded export file.
#[tauri::command]
pub async fn webdav_upload_export(
    url: String,
    username: String,
    password: String,
    json_export: String,
    manifest_json: String,
    if_match_etag: Option<String>,
) -> Result<String, String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);

    // Ensure base dirs
    ensure_collection(&client, &auth, &format!("{}chartmate", root)).await?;
    ensure_collection(&client, &auth, &format!("{}chartmate/pdfs", root)).await?;

    // Gzip the JSON
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(json_export.as_bytes())
        .map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;

    // PUT db_export.json.gz
    let export_url = format!("{}chartmate/db_export.json.gz", root);
    let mut req = client
        .put(&export_url)
        .header(header::AUTHORIZATION, &auth)
        .header(header::CONTENT_TYPE, "application/gzip")
        .body(compressed);

    if let Some(ref etag) = if_match_etag {
        req = req.header("If-Match", etag.as_str());
    }

    let export_resp = req.send().await.map_err(|e| e.to_string())?;

    if export_resp.status() == StatusCode::PRECONDITION_FAILED {
        return Err(
            "CONFLICT: Remote was modified since last sync. Pull first.".into(),
        );
    }
    if !export_resp.status().is_success() {
        return Err(format!(
            "Export upload failed: {}",
            export_resp.status()
        ));
    }

    let new_etag = export_resp
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // PUT manifest.json last
    let manifest_url = format!("{}chartmate/manifest.json", root);
    let manifest_resp = client
        .put(&manifest_url)
        .header(header::AUTHORIZATION, &auth)
        .header(header::CONTENT_TYPE, "application/json")
        .body(manifest_json)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !manifest_resp.status().is_success() {
        return Err(format!(
            "Manifest upload failed: {}",
            manifest_resp.status()
        ));
    }

    Ok(new_etag)
}

/// Download and decompress db_export.json.gz — returns the raw JSON string.
/// The frontend performs the actual DB import via Kysely.
#[tauri::command]
pub async fn webdav_download_export(
    url: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);
    let export_url = format!("{}chartmate/db_export.json.gz", root);

    let resp = client
        .get(&export_url)
        .header(header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == StatusCode::NOT_FOUND {
        return Err("No export found on server. Push from another device first.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("Download failed: {}", resp.status()));
    }

    let compressed = resp.bytes().await.map_err(|e| e.to_string())?;
    let mut decoder = GzDecoder::new(compressed.as_ref());
    let mut json = String::new();
    decoder
        .read_to_string(&mut json)
        .map_err(|e| e.to_string())?;

    Ok(json)
}

/// PROPFIND on the remote pdfs/ directory — returns entries with path + size.
#[tauri::command]
pub async fn webdav_list_remote_pdfs(
    url: String,
    username: String,
    password: String,
) -> Result<Vec<RemotePdfEntry>, String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);
    let pdfs_url = format!("{}chartmate/pdfs/", root);
    let method = reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;

    let resp = client
        .request(method, &pdfs_url)
        .header(header::AUTHORIZATION, &auth)
        .header("Depth", "infinity")
        .header(header::CONTENT_TYPE, "application/xml")
        .body(PROPFIND_ALLPROP)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status() == StatusCode::NOT_FOUND {
        return Ok(vec![]);
    }
    if resp.status().as_u16() != 207 {
        return Err(format!("PROPFIND failed: {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let parsed = url::Url::parse(&pdfs_url).map_err(|e| e.to_string())?;
    let base_path = parsed.path().to_string();

    Ok(parse_propfind_entries(&body, &base_path))
}

/// Upload one PDF file. Creates intermediate directories as needed.
#[tauri::command]
pub async fn webdav_push_pdf(
    url: String,
    username: String,
    password: String,
    relative_path: String,
    abs_local_path: String,
) -> Result<(), String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);

    let file_bytes = fs::read(&abs_local_path)
        .await
        .map_err(|e| format!("Cannot read {}: {}", abs_local_path, e))?;

    // Ensure each parent directory exists
    let parts: Vec<&str> = relative_path.split('/').collect();
    for depth in 1..parts.len() {
        let dir_url = format!(
            "{}chartmate/pdfs/{}",
            root,
            parts[..depth].join("/")
        );
        ensure_collection(&client, &auth, &dir_url).await?;
    }

    let remote_url = format!("{}chartmate/pdfs/{}", root, relative_path);
    let resp = client
        .put(&remote_url)
        .header(header::AUTHORIZATION, &auth)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .body(file_bytes)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("PDF upload failed: {}", resp.status()));
    }
    Ok(())
}

/// Download one PDF file with an atomic write (tmp → rename).
/// A crash mid-download never leaves a corrupt file.
#[tauri::command]
pub async fn webdav_pull_pdf(
    url: String,
    username: String,
    password: String,
    relative_path: String,
    abs_local_path: String,
) -> Result<(), String> {
    let client = make_client()?;
    let root = ensure_trailing_slash(&url);
    let auth = basic_auth(&username, &password);
    let remote_url = format!("{}chartmate/pdfs/{}", root, relative_path);

    let resp = client
        .get(&remote_url)
        .header(header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("PDF download failed: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if let Some(parent) = std::path::Path::new(&abs_local_path).parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Cannot create dirs: {}", e))?;
    }

    // Atomic write — rsync pattern
    let tmp = format!("{}.tmp", abs_local_path);
    fs::write(&tmp, &bytes)
        .await
        .map_err(|e| format!("Write failed: {}", e))?;
    fs::rename(&tmp, &abs_local_path)
        .await
        .map_err(|e| format!("Rename failed: {}", e))?;

    Ok(())
}
