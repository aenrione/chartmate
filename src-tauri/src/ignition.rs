use base64::{engine::general_purpose, Engine as _};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri::webview::DownloadEvent;
use tokio::sync::oneshot;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_DL_ID: AtomicU64 = AtomicU64::new(1);

pub struct IgnitionState {
    pub pending: Mutex<HashMap<u64, oneshot::Sender<CallbackPayload>>>,
    pub pending_downloads: Mutex<HashMap<u64, oneshot::Sender<Result<(), String>>>>,
}

impl Default for IgnitionState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            pending_downloads: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct CallbackPayload {
    pub ok: bool,
    pub data: String,
}

const AUTH_LABEL: &str = "ignition-auth";

/// Injected into every page load of the auth window.
/// - Detects login by watching for <meta name="dt-token">
/// - Exposes window.__ignition.search / .getDownloadUrl for Rust to call
const INIT_SCRIPT: &str = r#"
(function () {
    'use strict';

    // Column spec matching what the server expects
    const COLUMNS = [
        { data: 'add', searchable: false, orderable: false },
        { data: 'artistName', name: 'artist.name' },
        { data: 'titleName', name: 'title' },
        { data: 'albumName', name: 'album' },
        { data: 'tuning' },
        { data: 'memberName', name: 'author.name' },
        { data: 'created_at', searchable: false },
        { data: 'updated_at', searchable: false },
        { data: 'parts', searchable: false, orderable: false },
        { data: 'version', searchable: false, orderable: false },
        { data: 'year', searchable: false },
        { data: 'duration', searchable: false },
        { data: 'downloads', searchable: false },
        { data: 'platforms', searchable: false },
        { data: 'file_pc_link', searchable: false },
        { data: 'file_mac_link', searchable: false },
        { data: 'artist.name', searchable: false },
        { data: 'title', searchable: false },
        { data: 'album', searchable: false },
        { data: 'author.name', searchable: false },
        { data: 'genre', searchable: false },
        { data: 'subgenre', searchable: false },
        { data: 'discussionID', searchable: false },
        { data: 'artistsFt' },
    ];

    function buildSearchParams(query) {
        const p = new URLSearchParams();
        p.set('draw', '1');
        COLUMNS.forEach((col, i) => {
            p.set(`columns[${i}][data]`, col.data);
            if (col.name) p.set(`columns[${i}][name]`, col.name);
            if (col.searchable === false) p.set(`columns[${i}][searchable]`, 'false');
            if (col.orderable === false) p.set(`columns[${i}][orderable]`, 'false');
        });
        p.set('order[0][column]', '7');
        p.set('order[0][dir]', 'desc');
        p.set('order[0][name]', 'updated_at');
        p.set('start', '0');
        p.set('length', '25');
        p.set('search[value]', query);
        p.set('search[regex]', 'false');
        return p.toString();
    }

    async function cb(id, ok, data) {
        try {
            await window.__TAURI_INTERNALS__.invoke('ignition_callback', {
                id: Number(id),
                ok,
                data: typeof data === 'string' ? data : JSON.stringify(data),
            });
        } catch (e) {
            console.error('[ignition] callback invoke failed', e);
        }
    }

    window.__ignition = {
        async search(id, query) {
            try {
                const dtToken = document.querySelector('meta[name="dt-token"]')?.content || '';
                const url = '/cdlc?' + buildSearchParams(query);
                const res = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                        'X-DT-Token': dtToken,
                    },
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const json = await res.json();
                await cb(id, true, JSON.stringify(json.data || []));
            } catch (e) {
                await cb(id, false, e.message || String(e));
            }
        },

        // Returns the signed PC download URL found in the CDLC detail page DOM.
        // Actual download is performed by a hidden Rust-managed WebView (no CORS issues).
        async getDownloadUrl(id, cdlcId) {
            try {
                const detailRes = await fetch('/cdlc/' + cdlcId, {
                    credentials: 'include',
                    headers: { Accept: 'text/html' },
                });
                if (!detailRes.ok) throw new Error('Detail page HTTP ' + detailRes.status);
                const html = await detailRes.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Ignition4 renders download buttons as:
                // <a href="https://ignition4.customsforge.com/user/collectedcdlcs/toggle/{id}?...&platform=pc&...">
                const pcLink = doc.querySelector('a[href*="platform=pc"]')
                    || doc.querySelector('a[href*="collectedcdlcs"]');

                if (!pcLink) throw new Error('No download link found — login may have expired');

                const href = pcLink.getAttribute('href');
                const url = href.startsWith('http')
                    ? href
                    : 'https://ignition4.customsforge.com' + href;

                await cb(id, true, url);
            } catch (e) {
                await cb(id, false, e.message || String(e));
            }
        },
    };

    // Auth detection — runs on each page navigation
    function checkAuth() {
        const meta = document.querySelector('meta[name="dt-token"]');
        if (meta && meta.content) {
            window.__TAURI_INTERNALS__.invoke('ignition_auth_ready').catch(() => {});
        }
    }

    window.__ignition.checkAuth = checkAuth;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAuth);
    } else {
        checkAuth();
    }
})();
"#;

/// Injected into ephemeral download windows.
/// Detects intermediate CDN pages (Google Drive virus-scan, Mediafire, etc.)
/// and automatically navigates to the direct download link — same approach as JDownloader.
const DOWNLOAD_INIT_SCRIPT: &str = r#"
(function () {
    'use strict';

    function tryAutoDownload() {
        const h = location.hostname;

        // Google Drive virus-scan / large-file warning
        // Renders a page with a form that has a "Download anyway" button
        if (h === 'drive.google.com' || h.endsWith('.google.com')) {
            // Modern Drive: form with id="downloadForm" or confirm link
            const form = document.querySelector('form#downloadForm');
            if (form) { form.submit(); return; }
            const confirmLink = document.querySelector('a[href*="confirm="]');
            if (confirmLink) {
                window.location.href = confirmLink.href;
                return;
            }
            // Try the #uc-download-link fallback
            const ucLink = document.getElementById('uc-download-link');
            if (ucLink) {
                window.location.href = ucLink.getAttribute('href');
                return;
            }
        }

        // Mediafire download page
        if (h.includes('mediafire.com')) {
            const btn = document.getElementById('downloadButton')
                || document.querySelector('a.btn-green[href]')
                || document.querySelector('a[aria-label="Download file"]');
            if (btn) { window.location.href = btn.getAttribute('href'); return; }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAutoDownload);
    } else {
        tryAutoDownload();
    }
})();
"#;

// ── Commands ─────────────────────────────────────────────────────────────────

/// Open (or focus) the CustomsForge auth WebView window.
#[tauri::command]
pub async fn ignition_open_auth(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(AUTH_LABEL) {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        // Page is already loaded — re-run auth check manually.
        // If still logged in, this fires ignition_auth_ready immediately.
        let _ = w.eval("window.__ignition && window.__ignition.checkAuth && window.__ignition.checkAuth()");
        return Ok(());
    }

    let url: url::Url = "https://ignition4.customsforge.com/cdlc"
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    WebviewWindowBuilder::new(&app, AUTH_LABEL, WebviewUrl::External(url))
        .title("CustomsForge – Sign In")
        .inner_size(1100.0, 760.0)
        .initialization_script(INIT_SCRIPT)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Called by the auth window's JS when it detects a successful login.
#[tauri::command]
pub fn ignition_auth_ready(app: AppHandle) -> Result<(), String> {
    // Hide the auth window — session is established, keep it alive for API calls.
    if let Some(w) = app.get_webview_window(AUTH_LABEL) {
        let _ = w.hide();
    }
    // Notify the main window.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("ignition://ready", ());
    }
    Ok(())
}

/// Called by the auth window's JS to resolve a pending async request.
#[tauri::command]
pub fn ignition_callback(
    state: State<'_, IgnitionState>,
    id: u64,
    ok: bool,
    data: String,
) -> Result<(), String> {
    let mut pending = state.pending.lock().unwrap();
    if let Some(tx) = pending.remove(&id) {
        let _ = tx.send(CallbackPayload { ok, data });
    }
    Ok(())
}

/// Eval a named function in the auth window and await its callback.
async fn eval_ignition(
    app: &AppHandle,
    state: &State<'_, IgnitionState>,
    js: String,
) -> Result<String, String> {
    let window = app
        .get_webview_window(AUTH_LABEL)
        .ok_or_else(|| "CustomsForge not authenticated. Open login first.".to_string())?;

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<CallbackPayload>();

    state.pending.lock().unwrap().insert(id, tx);

    window
        .eval(&format!("window.__ignition.{}", js.replace("{ID}", &id.to_string())))
        .map_err(|e| e.to_string())?;

    let payload = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
        .await
        .map_err(|_| "Request timed out".to_string())?
        .map_err(|_| "Callback channel dropped".to_string())?;

    if payload.ok {
        Ok(payload.data)
    } else {
        Err(payload.data)
    }
}

/// Search Ignition4 CDLC — returns raw JSON array string from the DataTables API.
#[tauri::command]
pub async fn ignition_search(
    app: AppHandle,
    state: State<'_, IgnitionState>,
    query: String,
) -> Result<String, String> {
    let safe = query.replace('\\', "\\\\").replace('"', "\\\"");
    eval_ignition(
        &app,
        &state,
        format!("search({{ID}}, \"{}\")", safe),
    )
    .await
}

/// Download a PSARC — returns base64-encoded bytes.
///
/// Two-step approach that avoids CORS issues with CDN redirects:
/// 1. JS (auth window) parses the CDLC detail page and returns the signed download URL.
/// 2. A hidden WebView window navigates to that URL. WKWebView sends session cookies and
///    follows the full redirect chain (Google Drive, Mediafire, etc.). When the CDN
///    returns a binary file, WKWebView's on_download handler fires and we save the bytes.
#[tauri::command]
pub async fn ignition_download(
    app: AppHandle,
    state: State<'_, IgnitionState>,
    cdlc_id: u32,
) -> Result<String, String> {
    // Step 1: get signed download URL from CDLC detail page DOM via auth window JS.
    let signed_url = eval_ignition(
        &app,
        &state,
        format!("getDownloadUrl({{ID}}, {})", cdlc_id),
    )
    .await?;

    // Step 2: set up temp file path and completion channel.
    let dl_id = NEXT_DL_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<Result<(), String>>();

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let temp_path = cache_dir.join(format!("ignition-dl-{}.psarc", dl_id));
    let temp_path_dl = temp_path.clone();

    let win_label = format!("ignition-dl-{}", dl_id);
    let win_label_dl = win_label.clone();

    state.pending_downloads.lock().unwrap().insert(dl_id, tx);

    // Step 3: open a hidden WebView that navigates to the signed URL.
    // It shares the WKWebViewDataStore (session cookies) with the auth window,
    // so the server accepts the request and redirects to the CDN.
    // When WKWebView receives a non-navigable response (binary file), on_download fires.
    let url: url::Url = signed_url.parse().map_err(|e: url::ParseError| e.to_string())?;

    WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::External(url))
        .visible(false)
        .initialization_script(DOWNLOAD_INIT_SCRIPT)
        .on_download(move |webview, event| {
            match event {
                DownloadEvent::Requested { destination, .. } => {
                    *destination = temp_path_dl.clone();
                    true
                }
                DownloadEvent::Finished { success, .. } => {
                    let app = webview.app_handle();
                    let state = app.state::<IgnitionState>();
                    if let Some(tx) = state.pending_downloads.lock().unwrap().remove(&dl_id) {
                        let result = if success {
                            Ok(())
                        } else {
                            Err("Download failed in WebView".to_string())
                        };
                        let _ = tx.send(result);
                    }
                    // Close the ephemeral download window.
                    if let Some(w) = app.get_webview_window(&win_label_dl) {
                        let _ = w.close();
                    }
                    true
                }
                _ => true,
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    // Step 4: await completion (120 s timeout).
    let download_result = tokio::time::timeout(std::time::Duration::from_secs(120), rx).await;

    match download_result {
        Err(_) => {
            state.pending_downloads.lock().unwrap().remove(&dl_id);
            if let Some(w) = app.get_webview_window(&win_label) {
                let _ = w.close();
            }
            return Err("Download timed out (120 s)".to_string());
        }
        Ok(Err(_)) => return Err("Download channel dropped".to_string()),
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Ok(Ok(()))) => {}
    }

    // Step 5: read the saved file, base64-encode, clean up.
    let bytes = std::fs::read(&temp_path)
        .map_err(|e| format!("Failed to read downloaded file: {}", e))?;

    let _ = std::fs::remove_file(&temp_path);

    Ok(general_purpose::STANDARD.encode(&bytes))
}
