# Research: the open-source label-printing landscape

Surveyed 2026-11-12 via GitHub search (stars at time of writing). Goal: borrow the best ideas, avoid the known dead ends, and never reinvent a protocol someone already reverse-engineered.

## The landscape in one paragraph

The ecosystem splits into four layers: (1) **protocol libraries** that speak to printers (brother_ql, dymojs, labelize, portakal), (2) **full apps** with a UI (gLabels, niimblue, thermoprint, Vue-Print-Designer), (3) **bridge daemons** that let browsers reach hardware (QZ Tray), and (4) **building blocks** (JsBarcode, bwip-js, pylabels). Nobody has nailed all four in one modern, friendly package — that gap is Labelit.

## Tier 1 — direct influences

### MultiMote/niimblue — ⭐ 830 · Svelte/TS · Web Bluetooth, Capacitor
Custom NIIMBOT client that designs and prints from PC or mobile browser. **Take:** proof that "no vendor app, no driver" works in production; a web UI *can* own the whole pipeline. Their `niimbluelib` (⭐ 146) is a clean TS printer-communication library worth studying for its transport abstraction.

### pklaus/brother_ql — ⭐ 728 · Python
The reference implementation of Brother's QL raster language (QL-500 → QL-1110NWB), plus **brother_ql_web** (⭐ 326) which wraps it in a web service. **Take:** the raster command set, media-type detection (the printer knows which DK roll is loaded — expose that in the UI), and the proof that people *want* browser-based label printing (300+ stars for a 2016-era web UI).

### lukevp/ESC-POS-.NET — ⭐ 675 · C#
Cross-platform thermal printing over WiFi/BT/USB/Ethernet. **Take:** the transport matrix (every printer, every wire) and emitter architecture. Receipt printers share DNA with label printers via ESC/POS.

### j-evins/glabels-qt — ⭐ 504 · C++/Qt
The elder statesman: a real template library (Avery catalogue), mail-merge data model, and barcode support. **Take:** the merge/variable model and template metadata format. **Avoid:** desktop-era UX, modal print dialogs, XML-everything.

## Tier 2 — UI & editor patterns

### 0ldFive/Vue-Print-Designer — ⭐ 215 · Vue/TS
Visual print designer for forms, labels, receipts with templating, variables, silent printing. **Take:** property-panel patterns and variable binding UX.

### transcriptionstream/phomymo — ⭐ 196 · JS
Phomemo printing from a Chrome browser, no app, no drivers. **Take:** WebUSB/WebSerial printer control in the wild; privacy angle ("your labels never leave the machine").

### labelle-org/labelle — ⭐ 193 · Python
Unified CLI/printing across Dymo LabelWriter and Brother QL (dymoprint lineage). **Take:** multi-brand abstraction layer design.

### tomLadder/thermoprint — ⭐ 63 · React/TS/Konva · Web Bluetooth
Drag-and-drop label editor in the browser with a platform-agnostic TS core. **Take:** closest to our target UX — Konva canvas, editor/CLI separation. Study the core/UI split.

## Tier 3 — protocols & emission

### GOODBOY008/labelize — ⭐ 81 · Rust → WASM
Renders ZPL/EPL/TSPL/CPCL/DPL to PNG/PDF and back. **Take:** Rust + WASM means preview *and* emission from one engine — a very interesting option for Labelit's print core.

### productdevbook/portakal — ⭐ 76 · TS, zero-dep
Universal printer-language SDK: 9 languages, cross-compilers between them. **Take:** if mature, this could be our emitter layer instead of hand-writing ZPL/TSPL.

### Dwarf1er/openlabel — ⭐ 96 · C#
ZPL printing, DPI scaling, templating. **Take:** DPI-scaling maths (203 vs 300 dpi) and network-raw printing (port 9100).

### Ircama/PT-P300BT — ⭐ 97 · Python
Brother P-Touch Cube over BLE, from browser. **Take:** BLE label printers are packet-protocol puzzles that are already solved — don't re-solve.

### 0xMH/fichero-printer — ⭐ 315 · TS · kjy00302/niimprint — ⭐ 107 · Python
BLE reverse-engineering projects for cheap thermal printers. **Take:** the pattern for adding a new printer: capture → document → emit. Write ours so a new printer is a config + a driver file, not a fork.

## Tier 4 — building blocks

| Repo | ⭐ | Use |
|---|---|---|
| lindell/JsBarcode | 5.9k | 1D barcodes (Code128, EAN, UPC…) |
| metafloor/bwip-js | 2.4k | Everything else: QR, DataMatrix, GS1, PDF417 |
| qzind/tray | 1.1k | The incumbent browser→printer bridge; our job is to make it unnecessary |
| bcbnz/pylabels | 103 | Avery sheet geometry → multi-up PDF export |
| HenrikBengtsson/brother-ptouch-label-printer-on-linux | 256 | Linux/CUPS practicalities, udev, permissions |

## Dead ends to avoid

- **Browser `window.print()` as the primary path** — margins, scaling and media-size roulette. Fine as PDF-export fallback only.
- **Vendor SDKs** (Dymo Connect SDK, Brother b-PAC) — licensing and platform lock-in.
- **Server-side rendering per label** — breaks offline-first; rasterize on-device.
- **One-protocol monoculture** — emitters must be pluggable from day one (raster vs ZPL vs TSPL).

## Open questions

- Verify licences before vendoring any code (several of the above are GPL — that shapes whether we *use* or *reimplement*).
- Decide: emit printer languages directly, or render once to raster and adapt per printer (labelize-style)? Raster-first is simpler and DPI-portable; native ZPL is faster on Zebra. Probably: raster-first with native emitters later.
- BLE label printers on desktop Linux/Windows via btleplug — needs a hardware test matrix.
