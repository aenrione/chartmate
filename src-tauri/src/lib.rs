#[cfg(desktop)]
mod ignition;
mod psarc;
mod webdav;

#[cfg(desktop)]
use tauri::Emitter;

const LOCALHOST_PORT: u16 = 1430;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        .manage(ignition::IgnitionState::default())
        .invoke_handler(tauri::generate_handler![
            psarc::parse_psarc,
            psarc::extract_psarc_audio,
            ignition::ignition_open_auth,
            ignition::ignition_auth_ready,
            ignition::ignition_callback,
            ignition::ignition_search,
            ignition::ignition_download,
            webdav::webdav_test_connection,
            webdav::webdav_get_remote_manifest,
            webdav::webdav_upload_export,
            webdav::webdav_download_export,
            webdav::webdav_list_remote_pdfs,
            webdav::webdav_push_pdf,
            webdav::webdav_pull_pdf,
        ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        psarc::parse_psarc,
        psarc::extract_psarc_audio,
        webdav::webdav_test_connection,
        webdav::webdav_get_remote_manifest,
        webdav::webdav_upload_export,
        webdav::webdav_download_export,
        webdav::webdav_list_remote_pdfs,
        webdav::webdav_push_pdf,
        webdav::webdav_pull_pdf,
    ]);

    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_safe_area_insets::init())
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    let url = format!("http://localhost:{LOCALHOST_PORT}/");
                    let _ = window.navigate(url.parse().unwrap());
                }
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(url) = argv.get(1) {
            let _ = app.emit("deep-link://new-url", vec![url.clone()]);
        }
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
