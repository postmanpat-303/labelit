# Label-IT

Design labels, barcodes, and business cards at actual size on Windows, Linux, and macOS. Open designs side by side, set up thermal stock, or export a ready-to-print sheet.

[![Frontend checks](https://github.com/postmanpat-303/labelit/actions/workflows/frontend-checks.yml/badge.svg?branch=main)](https://github.com/postmanpat-303/labelit/actions/workflows/frontend-checks.yml)

[**Download 0.1.3 Preview**](https://github.com/postmanpat-303/labelit/releases/tag/v0.1.3-preview) · [Screenshots](#screenshots) · [Compare with gLabels](#label-it-and-glabels-feature-comparison) · [Report an issue](https://github.com/postmanpat-303/labelit/issues/new)

| Platform | Preview downloads | Setup |
| --- | --- | --- |
| Windows x64 | [Setup installer](https://github.com/postmanpat-303/labelit/releases/download/v0.1.3-preview/Label-IT-0.1.3-windows-x64-setup.exe) | [Windows instructions](#install-on-windows) |
| Linux x86-64 | [Debian package](https://github.com/postmanpat-303/labelit/releases/download/v0.1.3-preview/label-it_0.1.3_amd64.deb) · [AppImage](https://github.com/postmanpat-303/labelit/releases/download/v0.1.3-preview/Label-IT_0.1.3_amd64.AppImage) · [Portable archive](https://github.com/postmanpat-303/labelit/releases/download/v0.1.3-preview/Label-IT-0.1.3-linux-x86_64.tar.gz) | [Linux instructions](#install-on-linux) |
| macOS · Apple silicon and Intel | [Universal DMG](https://github.com/postmanpat-303/labelit/releases/download/v0.1.3-preview/Label-IT-0.1.3-macOS-universal.dmg) | [macOS instructions](#install-on-macos) |

## Screenshots

### Two designs in Split view

Open several designs in tabs and click either pane to switch which design you’re editing. Each open design keeps its own zoom, position, and undo history during the session. Drag the dotted background to reposition the view, or select **Center label** to reset it.

![Label-IT Split view with a business card on the left and a barcode label on the right](docs/screenshots/split-view.png)

<details>
<summary>More screenshots of sheet labels, shapes, printer setup, and the PIE menu</summary>

### Business cards and sheet labels

Start with a business-card preset or use your own label dimensions. Set margins and gaps for A4 or US Letter, then export an actual-size sheet PDF. This example fits eight 85 × 55 mm cards on A4.

![Business-card editor and A4 sheet settings showing eight cards per sheet](docs/screenshots/card-sheet.png)

### Shape tools and continuous roll

Add rectangles, ellipses, and lines, then resize them on the canvas or enter dimensions in millimetres. On continuous stock, the design height sets the print length. The printer driver handles media sensing and cutting.

![Continuous-roll label with an ellipse selected, showing shape dimensions and roll settings](docs/screenshots/roll-shapes.png)

**Label editor**

Font and size controls sit at the top of the left panel. Label stock, printer settings, and print actions are on the right.

![Label-IT editor with a selected text object, font controls, and printer settings](docs/screenshots/label-editor.png)

**First-run setup**

Choose an installed printer or come back to setup later.

![Label-IT welcome dialog showing the list of installed printers](references/label-it/printer-welcome.png)

**PIE menu**

Right-click a label element to open its properties, arrange it, duplicate it, or delete it.

![Label-IT PIE menu with labelled actions over the label canvas](docs/screenshots/pie-menu.png)

**Thermal raster test**

A full-label gradient on rounded 50 × 30 mm stock shows the stock, printer, and calibration controls together.

![Full-label thermal raster test on rounded stock with the calibration panel visible](references/label-it/thermal-raster-test.png)

</details>

## Designed for everyday use

Open several designs in tabs and select **Split view** to see two side by side. Click either pane to activate its design. Each open design keeps its own zoom, canvas position, and undo history during the session. Drag the dotted background to move the label view, or use **Center label** to reset it. [Label-IT 0.1.3 Preview](https://github.com/postmanpat-303/labelit/releases/tag/v0.1.3-preview)

1. **Choose your printer and stock.** First-run setup helps you pick an installed printer. The stock list can filter sizes against known printer limits, and you can enter custom dimensions in millimetres.
2. **Design right on the label.** Add text, artwork, or a barcode. New text opens the Font and Size controls first. Use the corner handles to resize elements, or right-click to open the PIE menu. When the PIE menu opens a sidebar card, the card briefly highlights.
3. **Check alignment and print.** Preview the output before using a label. Where direct printing is supported, the calibration controls let you adjust position in 0.1 mm steps and remember the offsets for that printer and stock.
4. **Reuse what you’ve made.** Keep designs in the local library, import compatible gLabels designs, or map CSV columns for batches on supported Windows printer setups.

The Linux preview exports exact-size PDFs for printing through the system print dialog. See [GitHub Releases](https://github.com/postmanpat-303/labelit/releases) for installers and platform notes.

The [Label-IT and gLabels comparison](https://github.com/postmanpat-303/labelit/blob/main/docs/label-app-bugs.svg) shows examples of the issues and print workflows that informed the early builds.

## Label-IT and gLabels feature comparison

On this **17-feature checklist**, Label-IT 0.1.3 Preview covers **17 of 17 (100%)** and gLabels 4 has **9 of 17 documented (52.9%)**. Each row has equal weight. The figures measure coverage of these selected workflows.

| Feature | Label-IT | gLabels 4 (Qt development version) |
| --- | --- | --- |
| Place and edit text | Available | Documented |
| Add images | Available | Documented |
| Create barcodes | Available | Documented |
| Print from CSV | Available on supported Windows printer setups | Documented as data merge |
| Custom label sizes | Available | Documented via templates |
| Sheet labels | Available · A4 or US Letter PDF with repeated copies | Documented · sheet stock templates |
| Business cards | Available · two size presets for sheet PDF export | Documented · card stock templates |
| Shape tools | Available · rectangle, ellipse, and line | Documented |
| Continuous roll | Available · design height sets print length, driver handles sensing and cutting | Documented |
| Filter stock by selected printer | Available | Unconfirmed |
| Guided alignment with live preview | Available on supported Windows printer setups | Unconfirmed |
| Save offsets per printer and stock | Available on supported Windows printer setups | Unconfirmed |
| Thermal raster preview | Available | Unconfirmed |
| PIE menu for editor actions | Available | Unconfirmed |
| Design tabs with independent undo and zoom | Available · 0.1.3 Preview | Unconfirmed |
| Show two designs side by side | Available · Split view in 0.1.3 Preview | Unconfirmed |
| Reposition and recenter the label view | Available · drag the background or select Center label | Unconfirmed |

gLabels coverage comes from its project documentation. The Label-IT column describes the public 0.1.3 preview. Unconfirmed means the feature was not verified in the gLabels documentation reviewed. gLabels 4 also documents user-defined variables and a broader stock template catalogue. [gLabels project](https://glabels.org/) · [gLabels 4 project](https://github.com/j-evins/glabels-qt) · [Label-IT releases](https://github.com/postmanpat-303/labelit/releases)

### Feature timeline

As of **21 November 2026**, gLabels has about **25 years of project history** dating back to 2001. Label-IT’s **first public preview was released 20 November 2026** and its second public build followed the next day. The gLabels start year comes from the project’s source history. The Label-IT dates are GitHub publication dates.

| Project | Milestone | Feature progression |
| --- | --- | --- |
| gLabels | 2001 · Project origins | Label and business card design for laser and inkjet printers. [GTK project](https://github.com/j-evins/glabels-gtk) |
| gLabels | 3.x era · Legacy support ended in 2018 | Sheet stock templates, editable text, images and shapes, barcodes, and data merge for batches. [Project overview](https://glabels.org/) |
| gLabels | 4.x · In development by December 2018 | The Qt rewrite adds cross-platform support, continuous-roll labels, user-defined variables, and more stock templates. [2018 release discussion](https://github.com/j-evins/glabels-qt/issues/43) · [Qt project](https://github.com/j-evins/glabels-qt) |
| Label-IT | 20 November 2026 · First public preview | Actual-size design with text, images and barcodes, compatible gLabels import, and direct Windows printing tested on a Zebra ZD410. Linux printing uses exact-size PDF export. [First preview](https://github.com/postmanpat-303/labelit/releases/tag/v0.1.0-preview) |
| Label-IT | 21 November 2026 · Linux compatibility preview | Font and Size moved to the top of text properties, the gLabels importer gained warnings for unreadable embedded images, and Debian 12-based packages lowered the Linux glibc requirement to 2.34. [Linux compatibility preview](https://github.com/postmanpat-303/labelit/releases/tag/v0.1.0-linux-compat) |

## Install on Windows

Run the **Windows x64 setup executable** on Windows 10 or later. The installer checks for Microsoft Edge WebView2 and adds Label-IT to the Start menu. Select **Run Label-IT now** at the end of setup to open it maximised. The current preview installer is unsigned. Windows 10 is a compatibility target and still needs a clean-install test.

## Install on Linux

Choose the package matching your distribution and processor:

| Distribution | Easiest install |
| --- | --- |
| Ubuntu | Open the `.deb` in your software installer, or run `sudo apt install ./label-it_0.1.3_amd64.deb` from the download folder. |
| Fedora | Use the x86-64 AppImage for this preview. |
| Arch and other desktops | Extract the x86-64 archive and run `sh install.sh` inside it as your regular user. The installer adds a launcher for your account. |

The Linux x86-64 build targets Debian 12 and glibc 2.34 or newer. The Debian package requires GTK 3 and WebKitGTK 4.1.

Find **Label-IT** in the **Office** category or search for it in your app launcher. Use **Help → Desktop shortcuts** to create a desktop shortcut. On GNOME, **Pin to dock** is available when the desktop allows it. On other desktops, right-click the app launcher and use its pin or add-to-panel command.

The Linux desktop build currently supports designing and exporting exact-size PDFs. In the system print dialog, select the matching stock and **Actual size**. Direct Linux printing is still in development.

To build packages from source on a Linux host with Node.js, Rust, and the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/), run:

```sh
node build-frontend.mjs
cargo build --release --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol
bash packaging/package-linux.sh src-tauri/target/release/labelit
```

Packages are written under `src-tauri/target/linux-packages`. The script always creates the per-user archive, creates a `.deb` when `dpkg-deb` is available, and creates an `.rpm` when `rpmbuild` is available. Build on the oldest release in the distro family you plan to support so the package can use that system’s runtime libraries.

To build the x86-64 Debian 12 compatibility packages in Docker, run:

```sh
docker build --platform linux/amd64 -f packaging/linux-bookworm.Dockerfile -t label-it-bookworm-amd64 .
docker run --rm --mount "type=bind,source=$PWD,target=/output" label-it-bookworm-amd64 \
  cp -a /packages/. /output/
```

The container builds the Debian package and per-user archive. The copy command places them in the current directory.

## Install on macOS

Download **Label-IT-0.1.3-macOS-universal.dmg** from the [0.1.3 preview release](https://github.com/postmanpat-303/labelit/releases/tag/v0.1.3-preview). Open the disk image and drag Label-IT into Applications. The app contains both Apple silicon and Intel binaries.

This preview uses ad-hoc signing. It has no Apple Developer ID signature or notarization, so macOS may block it under its security settings. GitHub Actions verified both architectures. A native installation and print test are pending. To print from this preview, export an exact-size PDF and choose **Actual Size** in the macOS print dialog.

## Windows desktop app

Install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/), then run these commands from the project folder:

```powershell
node build-frontend.mjs
cargo run --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol
```

For a release build, use `cargo build --release --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol` after staging the assets. Find the executable at `src-tauri/target/release/labelit.exe`. On the GNU toolchain, keep the generated `WebView2Loader.dll` alongside the executable. Rerun `node build-frontend.mjs` after changing the editor before building again.

To package the Windows x64 GNU release, run `packaging/package-windows.ps1` with NSIS available on your path, or pass `-Makensis` with the path to `makensis.exe`. The installer is written alongside the release executable. It installs for the current user, adds a Start menu shortcut, and leaves saved designs and lists in place when uninstalled. The installer checks for the Microsoft Edge WebView2 Runtime. This local release candidate is unsigned.

The desktop app keeps its design library in its own WebView2 storage. Existing designs in your regular browser are available in that browser.

The left panel contains the element tools, design library, and Properties. The right panel groups output actions, label stock, printer setup, calibration, and print activity into cards.

In **Printer setup**, choose a printer and enter the number of copies. **Print** or **Ctrl+P** sends the active design directly to that printer at the configured label size. The print job contains only the label artwork, with no browser headers or footers.

**Print activity** shows the latest job's Windows queue status. Use **Check queue** to refresh the status, or **Reprint last label job** to send the same artwork, stock size, printer and copy count again. Reprint is available until the app closes. A job that has left the queue may have printed or been removed.

**Cancel job** requests cancellation of the latest Label-IT job still in the Windows queue. Paper already fed by the printer may still print. **Print history** keeps recent jobs across restarts and lets you reprint individual labels and CSV batches up to 16 MB of raster data verbatim. For larger batches, reopen the saved list to recall the last printed range or choose a row to reprint.

For mailing lists or other records, make a design with text or barcode elements, then choose **Print from CSV**. Load a comma-separated UTF-8 file with a header row and match the columns to your design. Preview the data rows and choose the range to print. Label-IT checks the range for invalid barcodes and overflowing mapped text before submitting a single Windows print job with one label per row. The CSV does not change the saved design.

Choose the printer in the CSV dialog. The preview uses that printer’s saved resolution and offsets for the stock and warns if the offsets would clip a barcode or mapped text. The print range starts at row 1 only. Use **Select all rows** to include the whole list. When editing records, you can move between rows and return to your drafts. **Apply record changes** uses the edits for printing, and **Discard row changes** restores the applied values.

Use **Paste spreadsheet rows** to load copied cells directly. **Check range** lists the rows that need attention and lets you jump to each preview. **Print previewed row** prints just that record so you can check a sample or replace one label from a batch.

Choose **New address list** to start with address fields, or edit any list under **Find or edit records**. **Generate serial numbers** prepares sequential records with an optional date column. You can preview, save, export, and print generated rows like imported CSV data.

Use **Save list** to keep an imported list on this device. Choose it later from **Saved list** to reuse the records and the saved column mappings for the active design. **Export CSV** downloads the active list, including its column names.

Label-IT remembers **Print resolution**, **Feed offset**, and **Sideways offset** for each printer and stock size. Under **Calibrate stock**, print one test and compare the frame on the paper with the preview. Use **Move up** or **Move down** to preview a 0.1 mm adjustment relative to the last test. Print again to check the change, then choose **Looks good** to save it. Use **Enter measured gaps** to calculate feed and sideways corrections from all four margins.

Use **Printer and stock setups** to save or switch combinations in one place. **Print preview** shows the output raster with the printer offsets applied. Choose **Actual dots** to inspect it at one display pixel per raster dot.

Set **Corner radius (mm)** in **Label stock** to match rounded stock, or use 0 for square corners. Label-IT masks artwork outside the curve in the print raster and PDF. **Print tone** defaults to black-and-white thermal dots for Zebra queues and driver-managed colour for other printers. Preview, direct print, and CSV jobs share the same raster processing. Physical tone and alignment still depend on printhead settings, stock, and calibration.

Choose **ALIEXPRESS THERMAL 50x30** for the stock tested on the Zebra ZD410. The labels are 50 mm wide by 30 mm along the feed, with an approximately 6 mm gap. The leading edges are about 36 mm apart.

On the tested ZD410 at 203 dpi, a feed offset of +3.6 mm and a sideways offset of +0.65 mm centred the calibration print. Two consecutive calibration labels showed no visible feed drift, and the Code 39 test label scanned successfully as `LT12`.

A two-row CSV batch also printed in order from one Windows queue job on the ZD410. Both Code 39 labels scanned successfully as `LT12` and `LT13`.

On this workspace's existing Rust GNU toolchain, add the local MinGW tools to the current PowerShell session before running Cargo:

```powershell
$env:Path = "$env:USERPROFILE\tools\w64devkit\w64devkit\bin;$env:Path"
```

## Technology

Label-IT uses Tauri 2 and Rust for the desktop app, with HTML, CSS, JavaScript modules, and Canvas for the editor. The frontend build uses Node.js. GitHub Actions checks the frontend on pushes and pull requests and builds the universal macOS preview on demand.

## Browser prototype

From the Label-IT project folder, run `node serve.mjs` with Node.js 24. From any folder on this Windows workspace, use the full path:

```cmd
node "C:\Users\DMAN\Documents\Codex\labelit\serve.mjs"
```

Keep that terminal open and visit <http://127.0.0.1:4173> in a current browser. The editor has no package installation step. Add text, choose a preset or enter dimensions in millimetres, and export a PDF at 203 or 300 dpi. The active design is saved locally in the browser.

Use **Add image** for PNG, JPEG, or WebP files up to 10 MB. Adjust the image width in millimetres to resize it proportionally. **Add barcode** creates a Code 39 symbol. Use **Barcode format** in Properties to switch to Code 128, QR Code, or Data Matrix. Label-IT checks that a barcode fits with its quiet zone and flags undersized 2D codes for the selected output resolution. PDF output is grayscale.

For a photo, **Fit image to print area** leaves a safety margin. **Use full printable height** puts the whole photo as high as the label size, aspect ratio, rounded corners, and current printer offsets allow, without cropping or stretching.

In **Properties**, use **Align to label** to place a selected element against an edge or centre it. Label-IT warns when a barcode or its required blank margins extend past the label. For direct printing it also checks whether your printer offsets would clip the barcode.

In the left panel, click a thumbnail under **Designs** to open a saved label. Use **New design** for a blank label, **Duplicate** to start from a copy, or **Design name** to rename it. Changes save automatically in this browser. Switch to **Properties** to edit the selected element.

Use **Find designs** to search by name, text, or barcode value. In the desktop app, **Ctrl+F** opens the search field. Mark the current design as a **Favourite** to keep it at the top, or use **Favourites only** to hide other designs.

**Library tools** lets you organise designs with folders and tags, reuse a design as a template, and move designs to the recoverable trash. **Export design** produces an editable file with its artwork. **Back up library** includes designs, saved CSV lists, column mappings, and printer profiles. Restoring a backup adds its items and retains existing designs, lists, and calibration settings.

Use **File → Import from gLabels** to bring a `.glabels` or `.glabel` file into your design library. Label-IT imports one label from the sheet, with editable text, supported static barcodes, and compatible embedded gLabels 4 images. Review the import notes and print preview for changes to fonts, barcodes, or skipped objects. Reconnect merge fields through **Print from CSV**.

Right-click empty label space for the PIE insert menu. Each slice has a text label, and hovering or focusing it shows the full action in the centre. Right-click an element and choose **Arrange** to align it, change its layer, or lock it. Locked items can still be selected and copied. Use **Arrange → Unlock element** or the Properties panel to edit them again.

Shift-click elements to select several, then use **PIE → Arrange → Group selection** to move and align them together. Use **Ungroup** to edit them separately. The canvas zoom control returns to **Fit label** with one selection, and **Text box** in Properties sets wrapping, a fit height, and the minimum font size.

Press **Delete** to remove the selected element or group and **Ctrl+Z** to undo it. Delete edits characters while a text field has focus.

## Open-source research

| Project | Pattern for Label-IT |
| --- | --- |
| [NiimBlue](https://github.com/MultiMote/niimblue) | Keep hardware communication separate from the editor. Its NIIMBOT browser workflow is a reference for a future device adapter. |
| [gLabels](https://github.com/j-evins/glabels-qt) | Model media geometry and merge fields independently so one design can serve multiple records and sheet layouts. |
| [brother_ql](https://github.com/pklaus/brother_ql) | Use it as a Brother raster protocol reference when validating an emitter and its supported USB and network paths. |
| [thermoprint](https://github.com/tomLadder/thermoprint) | Keep rendering reusable outside the UI so device output and other entry points can share the model. |

The first implementation shares one millimetre-based renderer between preview and output. Canvas updates are coalesced to one animation frame, and full-resolution rendering is deferred until export. The PDF embeds a compressed grayscale image and uses a page size calculated directly from the label dimensions.

The desktop shell uses Tauri 2. The editor uses native browser APIs and Node's standard library to stage the frontend. The Rust backend keeps raster validation and batch preparation independent of the Windows printer adapter. The adapter handles printer discovery, queue status, and submitting label pages to Windows. Code 128, QR Code, and Data Matrix use [BWIP-JS 4.11.4](https://github.com/metafloor/bwip-js) bundled locally, with its licences under `src/vendor`.

## Roadmap

- Expand the stock catalogue.
- **Android app.** Bring the label editor, saved designs, stock profiles, and CSV workflows to Android. Validate media setup, alignment, and barcode scans on supported printers. Start by testing one printer connection on real Android hardware, then expand support based on the results.

