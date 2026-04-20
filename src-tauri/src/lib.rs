mod ignition;
mod psarc;

use tauri::Emitter;

const LOCALHOST_PORT: u16 = 1430;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ignition::IgnitionState::default())
        .invoke_handler(tauri::generate_handler![
            psarc::parse_psarc,
            psarc::extract_psarc_audio,
            ignition::ignition_open_auth,
            ignition::ignition_auth_ready,
            ignition::ignition_callback,
            ignition::ignition_search,
            ignition::ignition_download,
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Forward deep-link URIs from second instance to first
            if let Some(url) = argv.get(1) {
                let _ = app.emit("deep-link://new-url", vec![url.clone()]);
            }
        }))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .setup(|_app| {
            // tauri-plugin-localhost starts an HTTP server but does not automatically
            // navigate the WebView to it — the default window URL is tauri://localhost,
            // which YouTube's iframe API rejects (Error 153 / postMessage failure).
            // Explicitly navigate to http://localhost:PORT in production builds only;
            // dev mode uses devUrl (http://localhost:1420) which is already HTTP.
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    let url = format!("http://localhost:{LOCALHOST_PORT}/");
                    let _ = window.navigate(url.parse().unwrap());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
