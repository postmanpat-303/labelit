use crate::{
    print_job::{PrintSettings, StagedPages},
    windows_print,
};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request};

#[tauri::command]
pub async fn list_printers() -> Result<Vec<String>, String> {
    windows_print::list_printers()
}

#[tauri::command]
pub fn open_device_settings(bluetooth: bool) -> Result<(), String> {
    let page = if bluetooth { "ms-settings:bluetooth" } else { "ms-settings:printers" };
    open_link(page).map_err(|_| "Could not open Windows device settings.".into())
}

#[tauri::command]
pub fn open_project_documentation(project: &str) -> Result<(), String> {
    let url = match project {
        "labelit" => "https://github.com/postmanpat-303/labelit",
        "coffee" => "https://buymeacoffee.com/postmanpat",
        "niimgo" => "https://github.com/thedemons/niimgo",
        "niimprintx" => "https://github.com/niimbot/niimprintx",
        "lprint" => "https://github.com/michaelrsweet/lprint",
        "phomemo-tools" => "https://github.com/vivier/phomemo-tools",
        "phomymo" => "https://github.com/transcriptionstream/phomymo",
        "openprinting" => "https://openprinting.github.io/cups/drivers.html",
        "tauri" => "https://github.com/tauri-apps/tauri",
        "bwip-js" => "https://github.com/metafloor/bwip-js",
        "bwipp" => "https://github.com/bwipp/postscriptbarcode",
        "inconsolata" => "https://github.com/googlefonts/Inconsolata",
        "tempfile" => "https://github.com/Stebalien/tempfile",
        "windows-rs" => "https://github.com/microsoft/windows-rs",
        "glabels" => "https://github.com/j-evins/glabels-qt",
        "glabels-team" => "https://github.com/j-evins/glabels-gtk/blob/master/AUTHORS",
        "glabels-qt-team" => "https://github.com/j-evins/glabels-qt/blob/master/CREDITS.md",
        "glabels-news" => "https://github.com/j-evins/glabels-gtk/blob/master/NEWS",
        "glabels-docs-license" => "https://github.com/j-evins/glabels-gtk/blob/master/COPYING.README_FIRST#documentation",
        "glabels-interview" => "https://sourceforge.net/blog/glabels-lets-you-make-labels-with-style/",
        "thermoprint" => "https://github.com/tomLadder/thermoprint",
        "niimblue" => "https://github.com/MultiMote/niimblue",
        "brother-ql" => "https://github.com/pklaus/brother_ql",
        _ => return Err("This project is not in the Label-IT catalog.".into()),
    };
    open_link(url).map_err(|_| "Could not open the project documentation.".into())
}

fn open_link(url: &str) -> Result<(), ()> {
    use std::ptr::null;
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    let uri: Vec<u16> = url.encode_utf16().chain([0]).collect();
    let result = unsafe {
        ShellExecuteW(std::ptr::null_mut(), null(), uri.as_ptr(), null(), null(), SW_SHOWNORMAL)
    };
    if result as isize <= 32 {
        return Err(());
    }
    Ok(())
}

#[tauri::command]
pub async fn printable_area(
    printer: String,
    width_tenths: i32,
    height_tenths: i32,
) -> Result<[f64; 4], String> {
    let settings = PrintSettings {
        printer,
        width: 1,
        height: 1,
        width_tenths,
        height_tenths,
    };
    settings.validate()?;
    tauri::async_runtime::spawn_blocking(move || windows_print::printable_area(&settings))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn print_job_status(printer_name: String, job_id: u32) -> Result<&'static str, String> {
    windows_print::print_job_status(printer_name, job_id)
}

#[tauri::command]
pub async fn cancel_print_job(printer_name: String, job_id: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        windows_print::cancel_print_job(printer_name, job_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn print_label(request: Request<'_>) -> Result<u32, String> {
    let (settings, copies, pixels) = decode_label(&request)?;
    let pages = (0..copies).map(|_| Ok(pixels));
    windows_print::print_document(&settings, "Label-IT label", pages)
}

#[tauri::command]
pub async fn print_zebra_label(request: Request<'_>) -> Result<u32, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Missing Zebra label image.".into());
    };
    let (offsets, label) = bytes.split_at_checked(8).ok_or("Missing Zebra offsets.")?;
    let feed = i32::from_le_bytes(offsets[..4].try_into().unwrap());
    let sideways = i32::from_le_bytes(offsets[4..].try_into().unwrap());
    let (settings, copies, pixels) = decode_label_bytes(label)?;
    windows_print::print_zebra_label(&settings, copies, feed, sideways, pixels)
}

fn decode_label<'a>(request: &'a Request<'_>) -> Result<(PrintSettings, i32, &'a [u8]), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Missing label image.".into());
    };
    decode_label_bytes(bytes)
}

fn decode_label_bytes(bytes: &[u8]) -> Result<(PrintSettings, i32, &[u8]), String> {
    let (header, payload) = bytes.split_at_checked(24).ok_or("Incomplete print job.")?;
    let mut fields = header
        .chunks_exact(4)
        .map(|word| i32::from_le_bytes(word.try_into().unwrap()));
    let mut next = || fields.next().unwrap();
    let (width, height, width_tenths, height_tenths, copies, name_length) =
        (next(), next(), next(), next(), next(), next());
    let (printer, pixels) = payload
        .split_at_checked(name_length as usize)
        .ok_or("Missing printer name.")?;
    let printer = std::str::from_utf8(printer).map_err(|_| "Invalid printer name.")?;
    let settings = PrintSettings {
        printer: printer.into(),
        width,
        height,
        width_tenths,
        height_tenths,
    };
    settings.validate()?;
    if !(1..=999).contains(&copies) || pixels.len() != settings.byte_count() {
        return Err("Invalid copies or label image.".into());
    }
    Ok((settings, copies, pixels))
}

#[derive(Default)]
pub struct CsvBatches(Mutex<BatchSlot>);

#[derive(Default)]
struct BatchSlot {
    next_id: u32,
    batch: Option<CsvBatch>,
}

struct CsvBatch {
    id: u32,
    settings: PrintSettings,
    pages: StagedPages,
}

#[tauri::command]
pub async fn start_csv_batch(
    printer_name: String,
    width: i32,
    height: i32,
    width_tenths: i32,
    height_tenths: i32,
    pages: usize,
    batches: tauri::State<'_, CsvBatches>,
) -> Result<u32, String> {
    let settings = PrintSettings {
        printer: printer_name,
        width,
        height,
        width_tenths,
        height_tenths,
    };
    let pages = StagedPages::new(&settings, pages)?;
    let mut slot = batches
        .0
        .lock()
        .map_err(|_| "The CSV batch is unavailable.")?;
    slot.next_id = slot.next_id.wrapping_add(1).max(1);
    let id = slot.next_id;
    slot.batch = Some(CsvBatch {
        id,
        settings,
        pages,
    });
    Ok(id)
}

#[tauri::command]
pub async fn append_csv_page(
    request: Request<'_>,
    batches: tauri::State<'_, CsvBatches>,
) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Missing CSV label image.".into());
    };
    let (header, pixels) = bytes.split_at_checked(4).ok_or("Missing CSV batch ID.")?;
    let id = u32::from_le_bytes(header.try_into().unwrap());
    let mut slot = batches
        .0
        .lock()
        .map_err(|_| "The CSV batch is unavailable.")?;
    let batch = slot
        .batch
        .as_mut()
        .filter(|batch| batch.id == id)
        .ok_or("The CSV batch is no longer open.")?;
    batch.pages.append(pixels)
}

#[tauri::command]
pub async fn finish_csv_batch(
    batch_id: u32,
    batches: tauri::State<'_, CsvBatches>,
) -> Result<u32, String> {
    let batch = {
        let mut slot = batches
            .0
            .lock()
            .map_err(|_| "The CSV batch is unavailable.")?;
        let batch = slot
            .batch
            .as_ref()
            .filter(|batch| batch.id == batch_id)
            .ok_or("The CSV batch is no longer open.")?;
        batch.pages.require_complete()?;
        slot.batch.take().unwrap()
    };
    tauri::async_runtime::spawn_blocking(move || {
        windows_print::print_document(
            &batch.settings,
            "Label-IT CSV batch",
            batch.pages.into_pages()?,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cancel_csv_batch(
    batch_id: u32,
    batches: tauri::State<'_, CsvBatches>,
) -> Result<(), String> {
    let mut slot = batches
        .0
        .lock()
        .map_err(|_| "The CSV batch is unavailable.")?;
    if slot
        .batch
        .as_ref()
        .is_some_and(|batch| batch.id == batch_id)
    {
        slot.batch = None;
    }
    Ok(())
}
