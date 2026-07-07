// Aelix Canvas — Tauri host (P2 shell). Filesystem commands (save/load/export)
// are added in P6; all FS I/O routes through Rust commands, never the webview.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn ping() -> String {
    "aelix-canvas".into()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running Aelix Canvas");
}
