#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(any(windows, test))]
mod print_job;
#[cfg(windows)]
mod printing;
#[cfg(windows)]
mod windows_print;
#[cfg(windows)]
mod windows_export;
#[cfg(target_os = "linux")]
mod linux_shortcuts;

#[tauri::command]
fn desktop_platform() -> &'static str {
    std::env::consts::OS
}

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::args_os().nth(1).is_some_and(|arg| arg == "--install-menu") {
        if let Err(error) = linux_shortcuts::install_menu() {
            eprintln!("Could not install the Label-IT launcher: {error}");
            std::process::exit(1);
        }
        return;
    }
    let app = tauri::Builder::default();
    #[cfg(windows)]
    let app = app
        .manage(printing::CsvBatches::default())
        .invoke_handler(tauri::generate_handler![
            desktop_platform,
            windows_export::save_export,
            printing::list_printers,
            printing::open_device_settings,
            printing::open_project_documentation,
            printing::printable_area,
            printing::print_label,
            printing::print_zebra_label,
            printing::print_job_status,
            printing::cancel_print_job,
            printing::start_csv_batch,
            printing::append_csv_page,
            printing::finish_csv_batch,
            printing::cancel_csv_batch
        ]);
    #[cfg(target_os = "linux")]
    let app = app.invoke_handler(tauri::generate_handler![
        desktop_platform,
        linux_shortcuts::create_desktop_shortcut,
        linux_shortcuts::desktop_can_pin,
        linux_shortcuts::pin_to_gnome_dock
    ]);
    #[cfg(not(any(windows, target_os = "linux")))]
    let app = app.invoke_handler(tauri::generate_handler![desktop_platform]);
    app.run(tauri::generate_context!())
        .expect("failed to run Label-IT");
}
