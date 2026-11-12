# Labelit — idea board

Loose ideas, roughly grouped. Nothing here is committed; this is the floating-ideas document.

## Core experience

- **Three-screen flow:** Pick a size → design → print. No wizard lock-in — jump between them freely.
- **The canvas is the label.** Real mm, real rulers, real DPI. Zoom pill bottom-center, guides that snap, dashed selection outlines, drag-anything.
- **Media-aware:** if the printer reports which roll is loaded (Brother QL does), the canvas size follows automatically. Mismatch = friendly warning, not a failed print.
- **Zero-friction start:** app opens with the last-used label size and a blinking cursor. Printing a single address label should be *type, Enter, Cmd+P*.

## Data entry

- **Quick form** auto-generated from the template's `{{variables}}` — the right panel *is* the form.
- **Batch grid** that behaves like a spreadsheet: Tab right, Enter down, paste a column of addresses straight from email.
- **Imports:** CSV, XLSX, clipboard, JSON. Column mapping with draggable chips onto `{{variables}}`.
- **Generators as first-class fields:** auto-increment serials (`001…024`), dates, counters, weights, QR-from-any-field.
- **Record filmstrip** along the bottom: tiny live previews, click to jump, badges for printed/unprinted.

## Elements

- Text (auto-fit, shrink-to-label option), rich multi-style blocks
- Barcodes: Code128, EAN-13, UPC-A, Code39, ITF-14 via JsBarcode
- 2D: QR, DataMatrix, GS1 DataMatrix, PDF417 via bwip-js
- Shapes, lines, images (auto-dither to 1-bit for thermal), logos
- **Computed elements:** price with currency format, "best before = today + N days"

## Sizes & templates

- Ships with a searchable library: Brother DK series, Dymo LabelWriter/LabelManager, Zebra, Rollo, Avery sheets — filterable by brand and use-case
- **Custom size editor:** width/height/gap/shape (rect, rounded, round, continuous) down to 0.1 mm, saved into "My customs"
- **Continuous roll mode:** design the width, the length follows the content
- Template gallery: shipping, address, barcode/SKU, name badge, jar/round, file-folder spine, cable flag
- **Sheet imposition:** same design, N-up on Avery sheets via PDF export (borrow geometry math from pylabels)

## Printing

- **Direct I/O, no drivers:** raw USB, BLE, network (port 9100). Tauri/Rust core: `rusb`, `btleplug`, sockets.
- **Browser twin (PWA):** WebUSB/WebBluetooth where supported; otherwise PDF export sized exactly to the label.
- **Print queue panel** with progress bar, reprint-last, pause/cancel.
- **Calibration tool:** print a test grid once, nudge offsets, save per-printer profile.
- Density/speed/darkness controls per printer, with sensible defaults.

## Delight & craft

- Dark UI, one confident accent colour; the label artboard is the only white thing on screen.
- Keyboard-first: `Cmd+P` print, `Cmd+N` new label, arrows nudge by 0.1 mm (shift = 1 mm).
- Autosave + version history; undo/redo across sessions.
- Offline-first, no account, no telemetry. Portable single-file app.
- Printer status as ambient UI: green dot + model + loaded media, always visible in the top bar.

## Stretch ideas

- Import existing ZPL/EPL templates and convert to editable designs (labelize/portakal direction)
- "Print from anywhere": tiny local HTTP endpoint so scripts/other apps can POST a label
- Home Assistant integration path (hass-niimbot proved the appetite)
- Shared template format so designs are diffable JSON in git
