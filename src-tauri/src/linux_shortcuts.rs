use std::{
    env, fs,
    io::{ErrorKind, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

const LAUNCHER_NAME: &str = "app.labelit.editor.desktop";
const LAUNCHER: &str = include_str!("../../packaging/app.labelit.editor.desktop");
const ICON: &[u8] = include_bytes!("../icons/icon.png");

pub fn install_menu() -> Result<(), String> {
    let data = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or("Could not locate your Linux application menu.")?;
    let applications = data.join("applications");
    let icons = data.join("icons/hicolor/32x32/apps");
    fs::create_dir_all(&applications).map_err(|error| error.to_string())?;
    fs::create_dir_all(&icons).map_err(|error| error.to_string())?;
    fs::write(icons.join("app.labelit.editor.png"), ICON).map_err(|error| error.to_string())?;
    write_launcher(&applications)
}

#[tauri::command]
pub fn create_desktop_shortcut(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().desktop_dir().map_err(|error| error.to_string())?;
    if app.path().home_dir().is_ok_and(|home| home == path) || !path.is_dir() {
        return Err("Your desktop folder is unavailable. Use the Label-IT entry in the application menu.".into());
    }
    write_launcher(&path)?;
    Ok(format!("Label-IT shortcut is in {}.", path.display()))
}

#[tauri::command]
pub fn desktop_can_pin() -> bool {
    let desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    desktop.split(':').any(|name| name.eq_ignore_ascii_case("GNOME"))
        && Command::new("gsettings").args(["writable", "org.gnome.shell", "favorite-apps"])
            .output().is_ok_and(|value| value.status.success() && value.stdout == b"true\n")
}

#[tauri::command]
pub fn pin_to_gnome_dock() -> Result<String, String> {
    if !desktop_can_pin() {
        return Err("Use the pin option in your desktop’s application menu.".into());
    }
    let output = Command::new("gsettings").args(["get", "org.gnome.shell", "favorite-apps"])
        .output().map_err(|error| error.to_string())?;
    let current = std::str::from_utf8(&output.stdout).unwrap_or_default().trim();
    let items = current.strip_prefix("@as ").unwrap_or(current)
        .strip_prefix('[').and_then(|value| value.strip_suffix(']'))
        .filter(|_| output.status.success()).ok_or("Could not read your pinned applications.")?;
    let item = format!("'{LAUNCHER_NAME}'");
    if !items.contains(&item) {
        let separator = if items.trim().is_empty() { "" } else { ", " };
        let next = format!("[{items}{separator}{item}]");
        let status = Command::new("gsettings").args(["set", "org.gnome.shell", "favorite-apps", &next])
            .status().map_err(|error| error.to_string())?;
        if !status.success() {
            return Err("GNOME could not pin Label-IT. You can pin it from the application menu.".into());
        }
    }
    Ok("Label-IT is pinned to the GNOME dock.".into())
}

fn write_launcher(directory: &Path) -> Result<(), String> {
    let exe = env::current_exe().map_err(|error| error.to_string())?;
    let exe = exe.to_str().ok_or("The installation path must be valid UTF-8.")?;
    if exe.contains(['\n', '\r', '\t']) {
        return Err("The installation path contains a character desktop launchers cannot use.".into());
    }
    // Exec arguments use their own quoting, followed by Desktop Entry escaping.
    let quoted = exe.replace('\\', "\\\\\\\\").replace('%', "%%")
        .replace('"', "\\\\\"").replace('$', "\\\\$").replace('`', "\\\\`");
    let entry = LAUNCHER.replace("Exec=/usr/bin/labelit", &format!("Exec=\"{quoted}\""));
    let destination = directory.join(LAUNCHER_NAME);
    let mut file = match fs::OpenOptions::new().write(true).create_new(true).mode(0o755).open(&destination) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            if fs::read(&destination).is_ok_and(|previous| previous == entry.as_bytes()) {
                return Ok(());
            }
            return Err("A different shortcut already exists at that location.".into());
        }
        Err(error) => return Err(error.to_string()),
    };
    file.write_all(entry.as_bytes()).map_err(|error| error.to_string())
}
