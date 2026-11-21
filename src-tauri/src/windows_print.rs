use crate::print_job::PrintSettings;
use std::{
    mem::{align_of, size_of},
    ptr::{null, null_mut},
    slice,
};
use windows_sys::Win32::{
    Foundation::{GetLastError, ERROR_FILE_NOT_FOUND, ERROR_INVALID_PARAMETER},
    Graphics::{Gdi::*, Printing::*},
    Storage::Xps::{AbortDoc, EndDoc, EndPage, StartDocW, StartPage, DOCINFOW},
};

pub fn list_printers() -> Result<Vec<String>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let (mut bytes, mut count) = (0, 0);
    unsafe {
        EnumPrintersW(flags, null(), 4, null_mut(), 0, &mut bytes, &mut count);
        if bytes == 0 {
            return if count == 0 {
                Ok(Vec::new())
            } else {
                Err("Could not list Windows printers.".into())
            };
        }
        let mut storage = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
        if EnumPrintersW(
            flags,
            null(),
            4,
            storage.as_mut_ptr().cast(),
            bytes,
            &mut bytes,
            &mut count,
        ) == 0
        {
            return Err("Could not list Windows printers.".into());
        }
        debug_assert!(align_of::<usize>() >= align_of::<PRINTER_INFO_4W>());
        let printers =
            slice::from_raw_parts(storage.as_ptr().cast::<PRINTER_INFO_4W>(), count as usize);
        let mut names = Vec::new();
        for printer in printers {
            let name = printer.pPrinterName;
            if !name.is_null() {
                let length = (0..).take_while(|&index| *name.add(index) != 0).count();
                names.push(String::from_utf16_lossy(slice::from_raw_parts(
                    name, length,
                )));
            }
        }
        names.sort_unstable();
        names.dedup();
        Ok(names)
    }
}

unsafe fn printer_dc(settings: &PrintSettings) -> Result<HDC, String> {
    let name: Vec<u16> = settings.printer.encode_utf16().chain([0]).collect();
    // Ask the driver for a complete DEVMODE, including its private settings.
    unsafe {
        let mut printer = PRINTER_HANDLE::default();
        if OpenPrinterW(name.as_ptr(), &mut printer, null()) == 0 {
            return Err("Could not open the selected printer.".into());
        }
        let bytes = DocumentPropertiesW(null_mut(), printer, name.as_ptr(), null_mut(), null(), 0);
        if bytes < size_of::<DEVMODEW>() as i32 {
            ClosePrinter(printer);
            return Err("Could not read the selected printer's settings.".into());
        }
        let mut storage = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
        let mode = storage.as_mut_ptr().cast::<DEVMODEW>();
        let result = DocumentPropertiesW(
            null_mut(),
            printer,
            name.as_ptr(),
            mode,
            null(),
            DM_OUT_BUFFER,
        );
        ClosePrinter(printer);
        if result != 1 {
            return Err("Could not load the selected printer's settings.".into());
        }
        (*mode).dmFields |=
            DM_PAPERSIZE | DM_PAPERWIDTH | DM_PAPERLENGTH | DM_ORIENTATION | DM_COPIES | DM_SCALE;
        let paper = &mut (*mode).Anonymous1.Anonymous1;
        paper.dmPaperSize = DMPAPER_USER as i16;
        paper.dmPaperWidth = settings.width_tenths as i16;
        paper.dmPaperLength = settings.height_tenths as i16;
        paper.dmOrientation = DMORIENT_PORTRAIT as i16;
        paper.dmCopies = 1;
        paper.dmScale = 100;
        let dc = CreateDCW(null(), name.as_ptr(), null(), mode);
        if dc.is_null() {
            return Err("Could not prepare the selected printer.".into());
        }
        Ok(dc)
    }
}

pub(crate) fn printable_area(settings: &PrintSettings) -> Result<[f64; 4], String> {
    unsafe {
        let dc = printer_dc(settings)?;
        let cap = |flag| f64::from(GetDeviceCaps(dc, flag));
        let x_dpi = cap(LOGPIXELSX as i32);
        let y_dpi = cap(LOGPIXELSY as i32);
        let left = cap(PHYSICALOFFSETX as i32);
        let top = cap(PHYSICALOFFSETY as i32);
        let width = cap(HORZRES as i32);
        let height = cap(VERTRES as i32);
        DeleteDC(dc);
        if x_dpi <= 0.0 || y_dpi <= 0.0 || width <= 0.0 || height <= 0.0 {
            return Err("The printer did not report its printable area.".into());
        }
        Ok([
            left * 25.4 / x_dpi,
            top * 25.4 / y_dpi,
            (left + width) * 25.4 / x_dpi,
            (top + height) * 25.4 / y_dpi,
        ])
    }
}

pub fn print_job_status(printer_name: String, job_id: u32) -> Result<&'static str, String> {
    with_queue(printer_name, job_id, |printer| unsafe {
        let Some(storage) = job_info(printer, job_id)? else {
            return Ok("No longer in the Windows queue");
        };
        let status = (*storage.as_ptr().cast::<JOB_INFO_1W>()).Status;
        Ok(job_status_text(status))
    })
}

pub fn cancel_print_job(printer_name: String, job_id: u32) -> Result<(), String> {
    with_queue(printer_name, job_id, |printer| unsafe {
        let storage =
            job_info(printer, job_id)?.ok_or("The job is no longer in the Windows queue.")?;
        let info = &*storage.as_ptr().cast::<JOB_INFO_1W>();
        let title = info.pDocument;
        if title.is_null() {
            return Err("This job could not be identified as a Label-IT job.".into());
        }
        let length = (0..).take_while(|&index| *title.add(index) != 0).count();
        let title = String::from_utf16_lossy(slice::from_raw_parts(title, length));
        if !matches!(
            title.as_str(),
            "Label-IT label" | "Label-IT full-size label" | "Label-IT CSV batch"
                | "Labelit label" | "Labelit full-size label" | "Labelit CSV batch"
        ) {
            return Err("Only a Label-IT job can be cancelled here.".into());
        }
        if SetJobW(printer, job_id, 0, null(), JOB_CONTROL_DELETE) == 0 {
            return Err(format!(
                "Windows could not cancel the job (error {}).",
                GetLastError()
            ));
        }
        Ok(())
    })
}

fn with_queue<T>(
    printer_name: String,
    job_id: u32,
    operation: impl FnOnce(PRINTER_HANDLE) -> Result<T, String>,
) -> Result<T, String> {
    if printer_name.is_empty() || printer_name.contains('\0') || job_id == 0 {
        return Err("Invalid print queue or job number.".into());
    }
    let name: Vec<u16> = printer_name.encode_utf16().chain([0]).collect();
    unsafe {
        let mut printer = PRINTER_HANDLE::default();
        if OpenPrinterW(name.as_ptr(), &mut printer, null()) == 0 {
            return Err("Could not open the print queue.".into());
        }
        let result = operation(printer);
        ClosePrinter(printer);
        result
    }
}

unsafe fn job_info(printer: PRINTER_HANDLE, job_id: u32) -> Result<Option<Vec<usize>>, String> {
    let mut bytes = 0;
    GetJobW(printer, job_id, 1, null_mut(), 0, &mut bytes);
    if bytes < size_of::<JOB_INFO_1W>() as u32 {
        return job_lookup_error();
    }
    let mut storage = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
    if GetJobW(
        printer,
        job_id,
        1,
        storage.as_mut_ptr().cast(),
        bytes,
        &mut bytes,
    ) == 0
    {
        return job_lookup_error();
    }
    Ok(Some(storage))
}

fn job_status_text(status: u32) -> &'static str {
    for (flag, message) in [
        (
            JOB_STATUS_DELETED | JOB_STATUS_DELETING,
            "Cancelled or removed",
        ),
        (JOB_STATUS_OFFLINE, "Printer offline"),
        (JOB_STATUS_PAPEROUT, "Printer out of stock"),
        (JOB_STATUS_USER_INTERVENTION, "Printer needs attention"),
        (
            JOB_STATUS_ERROR | JOB_STATUS_BLOCKED_DEVQ,
            "Windows reported a print error",
        ),
        (JOB_STATUS_PAUSED, "Job paused"),
        (JOB_STATUS_PRINTED, "Windows reports printed"),
        (JOB_STATUS_COMPLETE, "Sent to the printer"),
        (JOB_STATUS_PRINTING, "Printing"),
        (JOB_STATUS_SPOOLING, "Spooling"),
    ] {
        if status & flag != 0 {
            return message;
        }
    }
    "Queued"
}

fn job_lookup_error() -> Result<Option<Vec<usize>>, String> {
    match unsafe { GetLastError() } {
        ERROR_INVALID_PARAMETER | ERROR_FILE_NOT_FOUND => Ok(None),
        code => Err(format!(
            "Could not read the Windows print queue (error {code})."
        )),
    }
}

pub fn print_document<P: AsRef<[u8]>>(
    settings: &PrintSettings,
    title: &str,
    pages: impl Iterator<Item = Result<P, String>>,
) -> Result<u32, String> {
    unsafe {
        let dc = printer_dc(settings)?;
        let result = write_document(dc, settings, title, pages);
        DeleteDC(dc);
        result
    }
}

pub(crate) fn print_zebra_label(
    settings: &PrintSettings,
    copies: i32,
    feed: i32,
    sideways: i32,
    pixels: &[u8],
) -> Result<u32, String> {
    if !settings.printer.eq_ignore_ascii_case("ZDesigner ZD410-203dpi ZPL")
        || (settings.width_tenths, settings.height_tenths) != (500, 300)
        || (settings.width, settings.height) != (400, 240)
        || !(-80..=80).contains(&feed)
        || !(-80..=80).contains(&sideways)
    {
        return Err("Full-size Zebra printing requires the ZD410 at 203 dpi and 50 × 30 mm stock.".into());
    }
    let shift_left = -sideways;
    let print_width = (400 + sideways.max(0)).min(448);
    let mut zpl = format!(
        "^XA^PON^LH0,0^PW{print_width}^LL240,N^LT{feed}^LS{shift_left}^FO0,0^GFA,12000,12000,50,"
    );
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for group in pixels.chunks_exact(32) {
        let mut byte = 0;
        for pixel in group.chunks_exact(4) {
            byte = (byte << 1) | usize::from(pixel[1] < 128);
        }
        zpl.push(char::from(HEX[byte >> 4]));
        zpl.push(char::from(HEX[byte & 15]));
    }
    zpl.push_str(&format!("^FS^PQ{copies}^XZ^XA^LT0^LS0^PW400^XZ"));
    let name: Vec<u16> = settings.printer.encode_utf16().chain([0]).collect();
    let mut title: Vec<u16> = "Label-IT full-size label".encode_utf16().chain([0]).collect();
    let mut datatype = [82u16, 65, 87, 0];
    let doc = DOC_INFO_1W {
        pDocName: title.as_mut_ptr(),
        pOutputFile: null_mut(),
        pDatatype: datatype.as_mut_ptr(),
    };
    unsafe {
        let mut printer = PRINTER_HANDLE::default();
        if OpenPrinterW(name.as_ptr(), &mut printer, null()) == 0 {
            return Err("Could not open the selected Zebra printer.".into());
        }
        let id = StartDocPrinterW(printer, 1, &doc);
        let mut written = 0;
        let size = zpl.len() as u32;
        let success = id != 0
            && StartPagePrinter(printer) != 0
            && WritePrinter(printer, zpl.as_ptr().cast(), size, &mut written) != 0
            && written == size
            && EndPagePrinter(printer) != 0
            && EndDocPrinter(printer) != 0;
        if id != 0 && !success {
            AbortPrinter(printer);
        }
        ClosePrinter(printer);
        if success { Ok(id) } else { Err("Windows could not submit the Zebra label.".into()) }
    }
}

unsafe fn write_document<P: AsRef<[u8]>>(
    dc: HDC,
    settings: &PrintSettings,
    title: &str,
    pages: impl Iterator<Item = Result<P, String>>,
) -> Result<u32, String> {
    let PrintSettings {
        width,
        height,
        width_tenths,
        height_tenths,
        ..
    } = *settings;
    let dots = |length, dpi| (f64::from(length) * f64::from(dpi) / 254.0).round() as i32;
    let target_width = dots(width_tenths, GetDeviceCaps(dc, LOGPIXELSX as i32));
    let target_height = dots(height_tenths, GetDeviceCaps(dc, LOGPIXELSY as i32));
    // Some drivers round custom media to hundredths of an inch.
    if (GetDeviceCaps(dc, PHYSICALWIDTH as i32) - target_width).abs() > 4
        || (GetDeviceCaps(dc, PHYSICALHEIGHT as i32) - target_height).abs() > 4
    {
        return Err(
            "The printer did not accept the label dimensions. Check its stock settings.".into(),
        );
    }
    let name: Vec<u16> = title.encode_utf16().chain([0]).collect();
    let document = DOCINFOW {
        cbSize: size_of::<DOCINFOW>() as i32,
        lpszDocName: name.as_ptr(),
        ..Default::default()
    };
    let bitmap = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..Default::default()
        },
        ..Default::default()
    };
    let job_id = StartDocW(dc, &document);
    if job_id <= 0 {
        return Err("Windows could not start the print job.".into());
    }
    for page in pages {
        let pixels = match page {
            Ok(page) => page,
            Err(error) => {
                AbortDoc(dc);
                return Err(error);
            }
        };
        if StartPage(dc) <= 0
            || StretchDIBits(
                dc,
                -GetDeviceCaps(dc, PHYSICALOFFSETX as i32),
                -GetDeviceCaps(dc, PHYSICALOFFSETY as i32),
                target_width,
                target_height,
                0,
                0,
                width,
                height,
                pixels.as_ref().as_ptr().cast(),
                &bitmap,
                DIB_RGB_COLORS,
                SRCCOPY,
            ) == GDI_ERROR
            || EndPage(dc) <= 0
        {
            AbortDoc(dc);
            return Err("Windows could not finish printing the label.".into());
        }
    }
    if EndDoc(dc) <= 0 {
        AbortDoc(dc);
        return Err("Windows could not finish the print job.".into());
    }
    Ok(job_id as u32)
}
