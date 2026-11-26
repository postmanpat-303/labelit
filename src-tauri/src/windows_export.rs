use std::{ffi::OsString, io::Write, mem::size_of, os::windows::ffi::OsStringExt, path::PathBuf};
use tauri::ipc::{InvokeBody, Request};
use windows_sys::Win32::{
    Foundation::HWND,
    UI::Controls::Dialogs::{
        CommDlgExtendedError, GetSaveFileNameW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT,
        OFN_PATHMUSTEXIST, OPENFILENAMEW,
    },
};

#[tauri::command]
pub async fn save_export(window: tauri::Window, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Missing export data.".into());
    };
    let separator = bytes
        .iter()
        .take(1024)
        .position(|byte| *byte == 0)
        .ok_or("Missing export filename.")?;
    let name = std::str::from_utf8(&bytes[..separator]).map_err(|_| "Invalid export filename.")?;
    let extension = match name.rsplit_once('.').map(|(_, extension)| extension) {
        Some("pdf") => "pdf",
        Some("labelit") => "labelit",
        _ => return Err("Unsupported export format.".into()),
    };
    let payload = bytes[separator + 1..].to_vec();
    if payload.is_empty() {
        return Err("The export is empty.".into());
    }
    let name = name.to_owned();
    let owner = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = choose_path(owner as HWND, &name, extension)? else {
            return Ok(false);
        };
        let directory = path.parent().ok_or("Choose a folder for the export.")?;
        let mut file =
            tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
        file.write_all(&payload)
            .map_err(|error| error.to_string())?;
        file.persist(&path)
            .map_err(|error| error.error.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn choose_path(owner: HWND, name: &str, extension: &str) -> Result<Option<PathBuf>, String> {
    let filter: Vec<u16> = if extension == "pdf" {
        "PDF documents\0*.pdf\0\0"
    } else {
        "Label-IT designs\0*.labelit\0\0"
    }
    .encode_utf16()
    .collect();
    let default_extension: Vec<u16> = extension.encode_utf16().chain([0]).collect();
    let mut path = vec![0u16; 32768];
    for (slot, unit) in path.iter_mut().zip(name.encode_utf16()) {
        *slot = unit;
    }
    let mut dialog = OPENFILENAMEW {
        lStructSize: size_of::<OPENFILENAMEW>() as u32,
        hwndOwner: owner,
        lpstrFilter: filter.as_ptr(),
        nFilterIndex: 1,
        lpstrFile: path.as_mut_ptr(),
        nMaxFile: path.len() as u32,
        lpstrDefExt: default_extension.as_ptr(),
        Flags: OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST,
        ..Default::default()
    };
    if unsafe { GetSaveFileNameW(&mut dialog) } == 0 {
        let error = unsafe { CommDlgExtendedError() };
        return if error == 0 {
            Ok(None)
        } else {
            Err(format!("Could not open Save As (error {error:#x})."))
        };
    }
    let length = path
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(path.len());
    Ok(Some(PathBuf::from(OsString::from_wide(&path[..length]))))
}
