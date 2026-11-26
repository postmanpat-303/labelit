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

### New feature brief — Standard inkjet label sheets

- Add a **Standard inkjet labels** section to the existing **Label stock** setup. Let users search an Avery stock database by template code, pack SKU, label dimensions, or sheet format.
- Include **Avery J8165-100** as the first required preset. It uses template **J8165**, with **eight labels on an A4 sheet**. Show the retail dimensions as **99.1 × 67.7 mm** and use Avery’s more precise **99.06 × 67.73 mm** dimensions for layout. [Avery product specification](https://www.avery.co.uk/product/parcel-labels-quickdrytm-inkjet-printable-991-x-677-mm-white-800-labels-j8165-100-j8165-100) · [Avery J8165 template](https://www.avery.co.uk/template-j8165)
- Store the sheet size, row and column counts, starting margins, and horizontal and vertical pitch per template. Verify all geometry against the manufacturer’s template. Pack sizes that share a template should resolve to the same layout.
- Selecting a preset should set the canvas to one label and load the matching sheet layout. Show all label positions in the sheet preview and export an exact-size A4 PDF for printing at **Actual size / 100%**.
- Offer three sheet print modes: **Single label** prints at a position picked in the sheet preview, **Fill sheet** repeats the same design, and **Sequential numbering** prints a different number on each label. Let users skip positions already used on a partly printed sheet.
- In sequential mode, suggest numeric portions of existing text, such as `POSITION 004`. Let users confirm the field and set the starting number, increment, and quantity. Preserve leading zeros and surrounding text. Preview the numbers in print order and continue the sequence across sheets when needed.
- Acceptance checks for J8165-100: either code finds the preset, single-label mode leaves the other seven positions blank, fill mode places eight copies on a fresh sheet, and sequential mode produces `POSITION 004` through `POSITION 011` with start 4 and step 1. The PDF matches the preview, and a 100% test print aligns with the top and bottom rows of the physical sheet.

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
