import { setupCsvPrinting } from "./csv-print.mjs";
import { downloadLibraryFile, fileName, isPrintProfileKey, readBackup, readDesignEntry } from "./library-files.mjs";
import { historyEntries, rememberJob } from "./print-history.mjs";
import { cornerRadius, finishPrintRaster, insideStock, previewOnStock, printTone } from "./print-raster.mjs";
import { thermalPrinterProfile } from "./thermal-printers.mjs";
import { readGlabelsDesign } from "./glabels-import.mjs";
import { inkjetStocks, numberedDesign, numberedFields, planInkjetSheets, searchInkjetStocks, stockPositions } from "./inkjet-sheets.mjs";
import { barcodeAtResolution, barcodeNames, drawLabel, makePdf, millimetresPerInch, elementBounds, isBarcodeValue,
  extraShapes, layoutText, makeSheetPdf, normaliseBarcode, shapeNames, sheetLayout, textFontFamily } from "./label.mjs";

const controls = Object.fromEntries(
  ["undo", "redo", "export", "print", "preset", "width", "height", "dpi", "add", "remove",
    "elements", "properties", "content", "x", "y", "size", "font-family", "font-field", "element-sizing", "stage", "preview", "status",
    "add-image", "image-file", "add-barcode", "element-type", "content-field", "content-name", "size-name",
    "label-dimensions", "design-gallery", "design-name", "new-design", "duplicate-design", "design-status",
    "design-search", "design-favourites-only", "design-favourite", "design-empty",
    "designs-tab", "properties-tab", "designs-panel", "properties-panel", "label-summary", "label-summary-value"]
    .map(id => [id, document.getElementById(id)])
);
const mediaMode = document.querySelector("#media-mode");
const sheetForm = document.querySelector("#sheet-layout");
const inkjet = Object.fromEntries([
  "stock", "search", "template", "stock-summary", "open", "dialog", "paper-details", "modes",
  "page", "prev", "next", "page-count", "numbering", "field", "start", "step", "quantity",
  "position-help", "mark-option", "mark-used", "status", "export", "print", "print-pages"
].map(name => [name, document.getElementById(`inkjet-${name}`)]));
let inkjetJob;
const shapeHeight = document.querySelector("#shape-height");
const paperSizes = { a4: { width: 210, height: 297 }, letter: { width: 215.9, height: 279.4 } };

const storageKey = "labelit-library-v1";
const legacyKey = "labelit-design-v1";
const designFileVersion = 1;
const inkjetUsageKey = "labelit-avery-template-usage";
const startingLabel = {
  width: 62, height: 29, dpi: 203,
  elements: [{ text: "Your label", x: 4, y: 4, size: 5 }]
};
const saveIndicator = document.querySelector("#save-indicator");
for (const menu of document.querySelectorAll(".header-menu")) {
  menu.querySelector(".file-actions").addEventListener("click", event => {
    if (event.target.closest("button")) menu.open = false;
  });
  document.addEventListener("click", event => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });
}
const themeButtons = Array.from(document.querySelectorAll("#appearance-menu button[data-theme]"));
function applyTheme(theme) {
  const selected = themeButtons.find(button => button.dataset.theme === theme) ?? themeButtons[0];
  document.documentElement.dataset.theme = selected.dataset.theme;
  for (const button of themeButtons) button.setAttribute("aria-pressed", String(button === selected));
}
try {
  applyTheme(localStorage.getItem("labelit-theme"));
} catch {
  applyTheme("studio");
}
for (const button of themeButtons) {
  button.onclick = () => {
    applyTheme(button.dataset.theme);
    try { localStorage.setItem("labelit-theme", button.dataset.theme); } catch {}
    button.closest(".header-menu").querySelector("summary").focus();
  };
}
let library = { active: 0, designs: [{ name: "Untitled label", label: structuredClone(startingLabel) }] };
let storedLibrary = null;
try {
  storedLibrary = localStorage.getItem(storageKey);
  const saved = JSON.parse(storedLibrary);
  if (saved?.designs?.[saved.active]?.label) {
    library = saved;
    saveIndicator.hidden = false;
  } else {
    const legacy = JSON.parse(localStorage.getItem(legacyKey));
    if (legacy?.elements) library.designs[0].label = legacy;
  }
} catch {
  controls["design-status"].textContent = "Saved designs could not be loaded.";
}
let label = library.designs[library.active].label;
let selected = label.elements.length ? 0 : -1;
const multiSelection = new Set();
let past = [];
let future = [];
let pan = { x: 0, y: 0 };
const openDesigns = new Map([[library.active, {}]]);
const openDesignBar = document.querySelector("#open-designs");
const splitView = document.querySelector("#split-view");
const splitPreview = document.querySelector("#split-preview");
const splitCanvas = document.querySelector("#split-canvas");
const workspacePanes = document.querySelector("#workspace-panes");
const splitImages = new Map();
let splitDesign;
let activeOnRight = false;
let frame;
let drag;
let inlineEdit;
let copiedElement;
let pastePoint;
const images = new Map();
const handleRadius = 4;
const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

function resizeHandles(bounds, scaleX, scaleY, design = label) {
  return corners.map(([horizontal, vertical]) => {
    const x = bounds.x + (horizontal > 0 ? bounds.width : 0);
    const y = bounds.y + (vertical > 0 ? bounds.height : 0);
    const insetX = handleRadius / scaleX;
    const insetY = handleRadius / scaleY;
    const visible = x >= -insetX && x <= design.width + insetX
      && y >= -insetY && y <= design.height + insetY;
    return {
      horizontal, vertical, visible,
      x: Math.max(insetX, Math.min(design.width - insetX, x)),
      y: Math.max(insetY, Math.min(design.height - insetY, y))
    };
  });
}

function loadImages(design, cache = images, onLoad = schedulePreview) {
  const sources = new Set(design.elements.filter(element => element.type === "image").map(element => element.source));
  for (const source of cache.keys()) {
    if (!sources.has(source)) cache.delete(source);
  }
  for (const source of sources) {
    if (cache.has(source)) continue;
    const image = new Image();
    image.onload = onLoad;
    image.src = source;
    cache.set(source, image);
  }
  return cache;
}

function drawPreview() {
  drawSplitPreview();
  let design = currentDesign();
  const dimensions = `${design.width} × ${design.height} mm`;
  if (controls["label-dimensions"].textContent !== dimensions) {
    controls["label-dimensions"].textContent = dimensions;
  }
  const zoom = Number(canvasZoom.value);
  const scale = Math.max(0.1, Math.min(
    (stageViewport.clientWidth - 64) / design.width,
    (stageViewport.clientHeight - 90) / design.height,
    8
  )) * zoom;
  const width = Math.max(1, design.width * scale);
  const height = Math.max(1, design.height * scale);
  const zoomed = zoom > 1;
  controls.stage.style.width = zoomed ? `${Math.max(stageViewport.clientWidth, width + 64)}px` : "";
  controls.stage.style.height = zoomed ? `${Math.max(stageViewport.clientHeight, height + 90)}px` : "";
  const preview = controls.preview;
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  const limitX = Math.max(0, (controls.stage.clientWidth - width) / 2 - 24);
  const limitY = Math.max(0, (controls.stage.clientHeight - height - 26) / 2 - 24);
  const panX = Math.max(-limitX, Math.min(limitX, pan.x));
  const panY = Math.max(-limitY, Math.min(limitY, pan.y));
  preview.style.translate = `${panX}px ${panY}px`;
  preview.style.borderRadius = `${cornerRadius(design) * width / design.width}px / ${cornerRadius(design) * height / design.height}px`;
  const pixelWidth = Math.round(width * devicePixelRatio);
  const pixelHeight = Math.round(height * devicePixelRatio);
  if (preview.width !== pixelWidth) preview.width = pixelWidth;
  if (preview.height !== pixelHeight) preview.height = pixelHeight;
  const context = preview.getContext("2d");
  if (drag) {
    const elements = design.elements.slice();
    if (drag.indices?.length > 1 && drag.position) {
      for (const index of drag.indices) {
        const element = elements[index];
        elements[index] = { ...element, x: element.x + drag.position.x - drag.bounds.x,
          y: element.y + drag.position.y - drag.bounds.y };
      }
    } else {
      elements[drag.index] = { ...elements[drag.index], ...drag.position };
    }
    design = { ...design, elements };
  }
  let previewDesign = design;
  if (inlineEdit && inlineText.classList.contains("canvas-text-draft")) {
    const elements = design.elements.slice();
    const draft = { ...inlineEdit.element, text: inlineText.value };
    if (inlineEdit.index < 0) elements.push(draft);
    else elements[inlineEdit.index] = draft;
    previewDesign = { ...design, elements };
  } else if (inlineEdit?.index >= 0) {
    previewDesign = { ...design, elements: design.elements.filter((_, index) => index !== inlineEdit.index) };
  }
  drawLabel(context, previewDesign, pixelWidth, pixelHeight, loadImages(design));
  updateBarcodeWarning(context, design);
  drawRulers(design, width, height);
  if (drag?.guides) drawAlignmentGuides(context, design, scale, drag.guides);
  const element = design.elements[drag?.index ?? selected];
  ghostSelection.hidden = true;
  if (element) {
    const indices = selectionIndices();
    if (indices.length > 1) {
      const bounds = selectionBounds(context, design, indices);
      context.strokeStyle = "#2563eb";
      context.lineWidth = 1 / scale;
      context.setLineDash([4 / scale, 3 / scale]);
      context.strokeRect(bounds.x - 0.5, bounds.y - 0.5, bounds.width + 1, bounds.height + 1);
      context.setLineDash([]);
      return;
    }
    const bounds = elementBounds(context, element);
    if (!element.locked && (bounds.x < 0 || bounds.y < 0
        || bounds.x + bounds.width > design.width || bounds.y + bounds.height > design.height)) {
      drawGhostSelection(bounds, width / design.width, height / design.height);
      return;
    }
    context.strokeStyle = element.type === "barcode" && outsideLabel(bounds, design) ? "#9a4b00" : "#2563eb";
    context.lineWidth = 1 / scale;
    context.setLineDash([4 / scale, 3 / scale]);
    context.strokeRect(bounds.x - 0.5, bounds.y - 0.5, bounds.width + 1, bounds.height + 1);
    context.setLineDash([]);
    if (!element.locked) {
      const scaleX = width / design.width;
      const scaleY = height / design.height;
      const radiusX = handleRadius / scaleX;
      const radiusY = handleRadius / scaleY;
      context.fillStyle = "#2563eb";
      for (const handle of resizeHandles(bounds, scaleX, scaleY, design)) {
        if (handle.visible) {
          context.fillRect(handle.x - radiusX, handle.y - radiusY, radiusX * 2, radiusY * 2);
        }
      }
    }
  }
}

function currentDesign() {
  const dimension = ["width", "height"].find(key => document.activeElement === controls[key]);
  if (dimension) {
    const value = validNumber(controls[dimension]);
    if (value !== undefined) return { ...label, [dimension]: value };
  }
  if (document.activeElement !== controls.content || !label.elements[selected]) return label;
  const element = label.elements[selected];
  const value = element.type === "barcode" ? normaliseBarcode(controls.content.value, element.format) : controls.content.value;
  if (element.type === "barcode" && !isBarcodeValue(value, element.format)) return label;
  const elements = label.elements.slice();
  elements[selected] = { ...element, text: value };
  return { ...label, elements };
}

function validNumber(input) {
  const value = Number(input.value);
  return input.value !== "" && Number.isFinite(value) && input.checkValidity() ? value : undefined;
}

function schedulePreview() {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    drawPreview();
  });
}

function syncControls() {
  for (const key of ["width", "height", "dpi"]) controls[key].value = label[key];
  const corners = document.querySelector("#corner-radius");
  corners.max = Math.floor(Math.min(label.width, label.height) * 5) / 10;
  corners.value = Math.min(cornerRadius(label), Number(corners.max));
  const dimensions = `${label.width},${label.height}`;
  controls.preset.value = Array.from(controls.preset.options).some(option => option.value === dimensions)
    ? dimensions : "custom";
  mediaMode.value = label.media ?? "label";
  const isInkjet = mediaMode.value === "inkjet";
  inkjet.stock.hidden = !isInkjet;
  controls.preset.closest("label").hidden = isInkjet;
  controls.width.readOnly = controls.height.readOnly = isInkjet;
  if (isInkjet) syncInkjetStock();
  sheetForm.hidden = mediaMode.value !== "sheet";
  document.querySelector("#roll-help").hidden = mediaMode.value !== "continuous";
  document.querySelector("#media-calibration").hidden = mediaMode.value !== "label";
  document.querySelector("#csv-open").hidden = !invoke || mediaMode.value === "sheet" || isInkjet;
  controls.print.hidden = !invoke && !isInkjet;
  controls.print.textContent = isInkjet ? "Sheet print" : mediaMode.value === "sheet" ? "Export sheet PDF" : "Print";
  const gap = mediaMode.value === "label" ? controls.preset.selectedOptions[0].dataset.gap : undefined;
  if (!sheetForm.hidden) updateSheetFit();
  stockGap.hidden = !gap;
  stockGap.textContent = gap ? `Approx. ${gap} mm gap between labels` : "";
  if (invoke) {
    loadOffsets();
    updatePrintTarget();
  }
  controls.elements.replaceChildren(...label.elements.map((element, index) => {
    const summary = (element.name ?? element.text ?? shapeNames[element.shape] ?? "Image").trim().split("\n")[0].slice(0, 40);
    const prefix = element.type === "barcode" ? `${barcodeNames[element.format ?? "code39"]} · ` : "";
    return new Option(prefix + (summary || "Empty text"), index);
  }));
  controls.elements.selectedIndex = selected;
  const element = label.elements[selected];
  controls.properties.disabled = !element;
  controls.properties.hidden = !element;
  controls["label-summary"].hidden = !!element;
  controls["label-summary-value"].textContent = `${label.width} × ${label.height} mm · ${label.dpi} dpi`;
  controls.remove.disabled = !element;
  const lock = document.querySelector("#lock-element");
  lock.textContent = element?.locked ? "Unlock element" : "Lock element";
  lock.setAttribute("aria-pressed", String(Boolean(element?.locked)));
  document.querySelector("#editable-properties").inert = Boolean(element?.locked);
  controls["element-sizing"].inert = Boolean(element?.locked);
  controls["font-field"].hidden = !isText(element);
  controls["font-family"].value = textFontFamily(element);
  document.querySelector("#text-box-settings").hidden = !isText(element);
  document.querySelector("#text-alignment-field").hidden = !isText(element);
  textAlignment.value = element?.textAlign ?? "left";
  document.querySelector("#text-mode-field").hidden = !isText(element);
  textMode.value = element?.wrapWidth ? "paragraph" : "point";
  for (const [property, input] of textBoxControls) input.value = element?.[property] ?? "";
  controls.undo.disabled = !past.length;
  controls.redo.disabled = !future.length;
  controls["element-type"].textContent = element?.type === "barcode" ? barcodeNames[element.format ?? "code39"]
    : element?.type === "image" ? "Image" : shapeNames[element?.shape] ?? "Text properties";
  document.querySelector("#barcode-format-field").hidden = element?.type !== "barcode";
  document.querySelector("#barcode-format").value = element?.format ?? "code39";
  controls["content-field"].hidden = !isText(element) && element?.type !== "barcode";
  document.querySelector("#shape-height-field").hidden = element?.type !== "shape";
  shapeHeight.value = element?.type === "shape" ? element.height : "";
  controls["content-name"].textContent = element?.type === "barcode" ? "Barcode value" : "Content";
  controls["size-name"].textContent = element?.type === "barcode"
    ? (["qrcode", "datamatrix"].includes(element.format) ? "Symbol size (mm)" : "Bar height (mm)")
    : ["image", "shape"].includes(element?.type) ? "Width (mm)" : "Font size (mm)";
  document.querySelector("#image-fit-actions").hidden = element?.type !== "image";
  controls.size.max = maximumSize(element);
  controls.content.value = element?.text ?? "";
  for (const key of ["x", "y", "size"]) controls[key].value = element?.[key] ?? "";
  schedulePreview();
}

function persistLibrary(next) {
  saveIndicator.hidden = true;
  try {
    if (localStorage.getItem(storageKey) !== storedLibrary) {
      controls["design-status"].textContent = "The design library changed in another tab. Reload before making more edits.";
      return false;
    }
    const serialized = JSON.stringify(next);
    localStorage.setItem(storageKey, serialized);
    storedLibrary = serialized;
    saveIndicator.hidden = false;
    controls["design-status"].textContent = "";
    return true;
  } catch {
    controls["design-status"].textContent = "Changes could not be saved in this browser.";
    return false;
  }
}

function save() {
  const entry = library.designs[library.active];
  if (entry.id) identifyElements(label);
  Object.assign(entry, { label, updatedAt: Date.now() });
  if (persistLibrary(library)) controls.status.textContent = "";
  syncControls();
  galleryCards.get(library.active)?.update();
  filterDesignGallery();
}

function identifyElements(design) {
  let changed = false;
  for (const element of design.elements) {
    if (!element.id) {
      element.id = crypto.randomUUID();
      changed = true;
    }
  }
  return changed;
}

const galleryCards = new Map();
const libraryControl = id => document.getElementById(id);
const folderFilter = libraryControl("design-folder-filter");

function createGalleryCard(entry, index) {
  const card = document.createElement("div");
  card.className = "design-gallery-item";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "design-card";
  if (index === library.active) open.setAttribute("aria-current", "true");
  const trash = document.createElement("button");
  trash.type = "button";
  trash.className = "design-card-remove";
  trash.textContent = "Remove";
  trash.setAttribute("aria-label", `Remove ${entry.name} from saved designs`);
  trash.onclick = () => {
    if (trashDesign(index)) controls["design-search"].focus({ preventScroll: true });
  };
  const preview = document.createElement("span");
  preview.className = "design-preview";
  const thumbnail = document.createElement("canvas");
  thumbnail.setAttribute("aria-hidden", "true");
  preview.append(thumbnail);
  const name = document.createElement("span");
  name.className = "design-card-name";
  if (entry.favourite) {
    const star = document.createElement("span");
    star.className = "design-favourite-mark";
    star.setAttribute("aria-hidden", "true");
    star.textContent = "★ ";
    name.append(star);
  }
  name.append(entry.name);
  const dimensions = document.createElement("span");
  dimensions.className = "design-card-size";
  const state = document.createElement("span");
  state.className = "design-card-state";
  preview.append(state);
  open.append(preview, name, dimensions);
  card.append(open, trash);
  const cache = new Map();
  function update() {
    const design = entry.label;
    const scale = Math.min(120 / design.width, 74 / design.height);
    const width = Math.max(1, Math.round(design.width * scale));
    const height = Math.max(1, Math.round(design.height * scale));
    thumbnail.style.width = `${width}px`;
    thumbnail.style.height = `${height}px`;
    thumbnail.width = width * 2;
    thumbnail.height = height * 2;
    state.textContent = index === library.active ? "Editing" : openDesigns.has(index) ? "Open in tab" : "";
    state.hidden = !state.textContent;
    dimensions.textContent = `${design.width} × ${design.height} mm`;
    const assets = loadImages(design, cache, update);
    drawLabel(thumbnail.getContext("2d"), design, thumbnail.width, thumbnail.height, assets);
  }
  open.onclick = () => {
    if (index !== library.active) openDesign(index);
    galleryCards.get(index)?.open.focus();
  };
  update();
  return { card, open, update };
}

function syncLibraryControls() {
  renderOpenDesigns();
  const active = library.designs[library.active];
  controls["design-name"].value = active.name;
  libraryControl("design-folder").value = active.folder ?? "";
  libraryControl("design-tags").value = (active.tags ?? []).join(", ");
  libraryControl("design-template").checked = Boolean(active.template);
  libraryControl("design-from-template").disabled = !library.designs.some(entry => entry.template && !entry.trashed);
  const folders = [...new Set(library.designs.filter(entry => !entry.trashed).map(entry => entry.folder).filter(Boolean))].sort();
  const folder = folderFilter.value;
  folderFilter.replaceChildren(new Option("All folders", ""), ...folders.map(name => new Option(name, name)));
  folderFilter.value = folders.includes(folder) ? folder : "";
  const trashed = library.designs.flatMap((entry, index) => entry.trashed ? [new Option(entry.name, index)] : []);
  libraryControl("design-trash-list").replaceChildren(...trashed);
  libraryControl("design-trash-bin").hidden = !trashed.length;
  controls["design-favourite"].setAttribute("aria-pressed", String(Boolean(active.favourite)));
  const entries = library.designs.map((entry, index) => ({ entry, index }));
  entries.sort((a, b) => Number(Boolean(b.entry.favourite)) - Number(Boolean(a.entry.favourite))
    || (b.entry.updatedAt ?? 0) - (a.entry.updatedAt ?? 0) || b.index - a.index);
  galleryCards.clear();
  const cards = entries.filter(({ entry }) => !entry.trashed).map(({ entry, index }) => {
    const thumbnail = createGalleryCard(entry, index);
    galleryCards.set(index, thumbnail);
    return thumbnail.card;
  });
  controls["design-gallery"].replaceChildren(...cards);
  filterDesignGallery();
}

function renderOpenDesigns() {
  if (!openDesigns.has(splitDesign)) splitDesign = undefined;
  splitView.disabled = openDesigns.size < 2;
  splitView.setAttribute("aria-pressed", String(splitDesign !== undefined));
  splitPreview.hidden = splitDesign === undefined;
  workspacePanes.toggleAttribute("data-active-right", splitDesign !== undefined && activeOnRight);
  if (splitDesign !== undefined) {
    const name = library.designs[splitDesign].name;
    document.querySelector("#split-name").textContent = name;
    splitPreview.setAttribute("aria-label", `Edit ${name}`);
  } else {
    splitImages.clear();
  }
  schedulePreview();
  const previousScroll = openDesignBar.scrollLeft;
  const tabs = [...openDesigns.keys()].map(index => {
    const entry = library.designs[index];
    const tab = document.createElement("div");
    tab.className = "open-design";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "open-design-name";
    select.textContent = entry.name;
    select.title = entry.name;
    if (index === library.active) select.setAttribute("aria-current", "true");
    select.onclick = () => {
      if (index !== library.active) openDesign(index);
      openDesignBar.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
    };
    tab.append(select);
    if (openDesigns.size > 1) {
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", `Close ${entry.name}`);
      close.onclick = () => closeDesign(index);
      tab.append(close);
    }
    return tab;
  });
  openDesignBar.replaceChildren(...tabs);
  openDesignBar.scrollLeft = previousScroll;
  const current = openDesignBar.querySelector('[aria-current="true"]');
  if (!current) return;
  const bar = openDesignBar.getBoundingClientRect();
  const tab = current.parentElement.getBoundingClientRect();
  if (tab.left < bar.left) openDesignBar.scrollLeft += tab.left - bar.left;
  if (tab.right > bar.right) openDesignBar.scrollLeft += tab.right - bar.right;
}

function drawSplitPreview() {
  if (splitPreview.hidden) return;
  const design = library.designs[splitDesign].label;
  const view = openDesigns.get(splitDesign);
  const zoom = Number(view.zoom ?? 1);
  const scale = Math.max(0.1, Math.min((splitPreview.clientWidth - 64) / design.width,
    (splitPreview.clientHeight - 90) / design.height, 8)) * zoom;
  const width = design.width * scale;
  const height = design.height * scale;
  splitCanvas.style.width = `${width}px`;
  splitCanvas.style.height = `${height}px`;
  splitCanvas.style.borderRadius = `${cornerRadius(design) * scale}px`;
  const limitX = Math.max(0, (splitPreview.clientWidth - width) / 2 - 24);
  const limitY = Math.max(0, (splitPreview.clientHeight - height - 26) / 2 - 24);
  const x = Math.max(-limitX, Math.min(limitX, view.pan?.x ?? 0));
  const y = Math.max(-limitY, Math.min(limitY, view.pan?.y ?? 0));
  splitCanvas.style.translate = `${x}px ${y - 13}px`;
  splitCanvas.width = Math.max(1, Math.round(width * devicePixelRatio));
  splitCanvas.height = Math.max(1, Math.round(height * devicePixelRatio));
  drawLabel(splitCanvas.getContext("2d"), design, splitCanvas.width, splitCanvas.height,
    loadImages(design, splitImages));
}

splitView.onclick = () => {
  splitDesign = splitDesign === undefined ? [...openDesigns.keys()].find(index => index !== library.active) : undefined;
  activeOnRight = false;
  renderOpenDesigns();
};
splitPreview.onclick = () => {
  if (openDesign(splitDesign)) controls.preview.focus({ preventScroll: true });
};

function closeDesign(index) {
  if (openDesigns.size < 2) return;
  if (index === library.active) {
    const keys = [...openDesigns.keys()];
    const position = keys.indexOf(index);
    if (!openDesign(keys[position + 1] ?? keys[position - 1])) return;
  }
  openDesigns.delete(index);
  renderOpenDesigns();
  galleryCards.get(index)?.update();
  openDesignBar.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
}

function filterDesignGallery() {
  const query = controls["design-search"].value.trim().toLocaleLowerCase();
  const favouritesOnly = controls["design-favourites-only"].checked;
  const templatesOnly = libraryControl("design-templates-only").checked;
  let visible = 0;
  for (const [index, { card }] of galleryCards) {
    const entry = library.designs[index];
    const matches = !query || entry.name.toLocaleLowerCase().includes(query)
      || [entry.folder ?? "", ...(entry.tags ?? [])].some(value => value.toLocaleLowerCase().includes(query))
      || entry.label.elements.some(element => element.text?.toLocaleLowerCase().includes(query));
    card.hidden = (favouritesOnly && !entry.favourite) || (templatesOnly && !entry.template)
      || (folderFilter.value && entry.folder !== folderFilter.value) || !matches;
    if (!card.hidden) visible++;
  }
  controls["design-empty"].hidden = visible > 0;
}

controls["design-search"].oninput = filterDesignGallery;
controls["design-favourites-only"].onchange = filterDesignGallery;
folderFilter.onchange = filterDesignGallery;
libraryControl("design-templates-only").onchange = filterDesignGallery;
function updateDesignEntry(properties) {
  const designs = library.designs.slice();
  designs[library.active] = { ...designs[library.active], ...properties };
  const next = { ...library, designs };
  if (persistLibrary(next)) {
    library = next;
    syncLibraryControls();
  }
}
controls["design-favourite"].onclick = () => {
  updateDesignEntry({ favourite: !library.designs[library.active].favourite });
};
libraryControl("design-folder").onchange = event => updateDesignEntry({ folder: event.target.value.trim() });
libraryControl("design-tags").onchange = event => updateDesignEntry({
  tags: [...new Set(event.target.value.split(",").map(tag => tag.trim()).filter(Boolean))].slice(0, 30)
});
libraryControl("design-template").onchange = event => updateDesignEntry({ template: event.target.checked });
const templateDialog = libraryControl("template-dialog");
const templateChoice = libraryControl("template-choice");
let templateSource;
let templateFields = [];
function loadTemplate() {
  const entry = library.designs[Number(templateChoice.value)];
  templateSource = structuredClone(entry);
  libraryControl("template-name").value = `${entry.name.slice(0, 72)} copy`;
  libraryControl("template-status").textContent = "";
  const container = libraryControl("template-fields");
  container.replaceChildren();
  templateFields = templateSource.label.elements.flatMap((element, index) => {
    if ((!isText(element) && element.type !== "barcode") || element.locked) return [];
    const field = document.createElement("label");
    const input = document.createElement(element.type === "barcode" ? "input" : "textarea");
    field.textContent = `${element.type === "barcode" ? "Barcode" : "Text"} ${index + 1}`;
    input.value = element.text;
    if (input.tagName === "TEXTAREA") input.rows = 2;
    else input.required = true;
    field.append(input);
    container.append(field);
    return [{ element, input, index }];
  });
}
templateChoice.onchange = loadTemplate;
libraryControl("design-from-template").onclick = () => {
  finishInlineText(true);
  const templates = library.designs.flatMap((entry, index) =>
    entry.template && !entry.trashed ? [new Option(entry.name, String(index))] : []);
  if (!templates.length) return;
  templateChoice.replaceChildren(...templates);
  if (library.designs[library.active].template) templateChoice.value = String(library.active);
  loadTemplate();
  templateDialog.showModal();
};
libraryControl("template-close").onclick = () => templateDialog.close();
libraryControl("template-form").onsubmit = event => {
  event.preventDefault();
  const name = libraryControl("template-name").value.trim();
  if (!name) return;
  for (const { element, input, index } of templateFields) {
    const text = element.type === "barcode" ? normaliseBarcode(input.value, element.format) : input.value;
    if (element.type === "barcode" && !isBarcodeValue(text, element.format)) {
      libraryControl("template-status").textContent = `Barcode ${index + 1} needs a valid ${barcodeNames[element.format ?? "code39"]} value.`;
      input.focus();
      return;
    }
    element.text = text;
  }
  templateDialog.close();
  createDesign(name, templateSource.label, { folder: templateSource.folder, tags: templateSource.tags });
};
function trashDesign(index) {
  if (!library.designs[index] || library.designs[index].trashed) return false;
  finishInlineText(true);
  const designs = library.designs.slice();
  designs[index] = { ...designs[index], trashed: true };
  if (index === library.active) {
    let next = [...openDesigns.keys()].find(key => !designs[key].trashed) ?? designs.findIndex(entry => !entry.trashed);
    if (next < 0) next = designs.push({ name: "Untitled label", label: structuredClone(startingLabel) }) - 1;
    return openDesign(next, designs);
  }
  const next = { ...library, designs };
  if (!persistLibrary(next)) return false;
  library = next;
  openDesigns.delete(index);
  syncLibraryControls();
  schedulePreview();
  return true;
}
libraryControl("design-trash").onclick = () => trashDesign(library.active);
libraryControl("design-untrash").onclick = () => {
  const index = Number(libraryControl("design-trash-list").value);
  if (!library.designs[index]?.trashed) return;
  const designs = library.designs.slice();
  designs[index] = { ...designs[index], trashed: false };
  openDesign(index, designs);
};

const designDeleteDialog = libraryControl("design-delete-dialog");
let pendingDesignDeletion;
libraryControl("design-delete").onclick = () => {
  const index = Number(libraryControl("design-trash-list").value);
  const entry = library.designs[index];
  if (!entry?.trashed) return;
  pendingDesignDeletion = entry;
  libraryControl("design-delete-description").textContent = `“${entry.name}” will be deleted from this library and can no longer be restored.`;
  designDeleteDialog.showModal();
};
libraryControl("design-delete-confirm").onclick = () => {
  const index = library.designs.indexOf(pendingDesignDeletion);
  if (index < 0 || !library.designs[index].trashed) {
    designDeleteDialog.close();
    return;
  }
  const reindex = key => key > index ? key - 1 : key;
  const designs = library.designs.filter((_, key) => key !== index);
  const next = { ...library, designs, active: reindex(library.active) };
  if (persistLibrary(next)) {
    library = next;
    const views = [...openDesigns];
    openDesigns.clear();
    for (const [key, view] of views) {
      if (key !== index) openDesigns.set(reindex(key), view);
    }
    if (splitDesign !== undefined) splitDesign = reindex(splitDesign);
    syncLibraryControls();
    schedulePreview();
  }
  designDeleteDialog.close();
  if (libraryControl("design-trash-bin").hidden) controls["design-search"].focus({ preventScroll: true });
};
designDeleteDialog.onclose = () => { pendingDesignDeletion = undefined; };

function openDesign(active, designs = library.designs) {
  finishInlineText(true);
  closePieMenu();
  cancelDrag();
  stopPanning();
  const previous = library.active;
  const next = { active, designs };
  if (!persistLibrary(next)) return false;
  if (active === splitDesign) {
    splitDesign = previous;
    activeOnRight = !activeOnRight;
  }
  openDesigns.set(previous, { past, future, selected, pan, zoom: canvasZoom.value,
    scrollLeft: stageViewport.scrollLeft, scrollTop: stageViewport.scrollTop });
  for (const index of openDesigns.keys()) {
    if (designs[index].trashed) openDesigns.delete(index);
  }
  const view = openDesigns.get(active) ?? {};
  openDesigns.set(active, view);
  library = next;
  label = designs[active].label;
  multiSelection.clear();
  selected = view.selected ?? (label.elements.length ? 0 : -1);
  past = view.past ?? [];
  future = view.future ?? [];
  pan = view.pan ?? { x: 0, y: 0 };
  canvasZoom.value = view.zoom ?? "1";
  canvasZoom.onchange();
  controls.status.textContent = "";
  syncControls();
  syncLibraryControls();
  requestAnimationFrame(() => {
    if (library.active === active) stageViewport.scrollTo(view.scrollLeft ?? 0, view.scrollTop ?? 0);
  });
  return true;
}

controls["design-name"].onchange = () => {
  const name = controls["design-name"].value.trim();
  if (name && name !== library.designs[library.active].name) {
    const designs = library.designs.slice();
    designs[library.active] = { ...designs[library.active], name, label, updatedAt: Date.now() };
    const next = { ...library, designs };
    if (persistLibrary(next)) library = next;
  }
  syncLibraryControls();
};
controls["design-name"].onkeydown = event => {
  if (event.key === "Enter") controls["design-name"].blur();
};

function createDesign(baseName, design, metadata = {}) {
  let name = baseName;
  let suffix = 2;
  while (library.designs.some(entry => entry.name === name)) name = `${baseName} ${suffix++}`;
  const designs = [...library.designs, { ...metadata, name, label: structuredClone(design), updatedAt: Date.now() }];
  openDesign(designs.length - 1, designs);
  if (library.active === designs.length - 1) {
    controls["design-search"].value = "";
    controls["design-favourites-only"].checked = false;
    libraryControl("design-templates-only").checked = false;
    folderFilter.value = "";
    filterDesignGallery();
    controls["design-name"].closest("details").open = true;
    controls["design-name"].focus();
    controls["design-name"].select();
  }
}

const dataListKey = "labelit-csv-lists-v1";
function importLibraryFile(button, inputId, apply) {
  const input = libraryControl(inputId);
  libraryControl(button).onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error("Choose a design or backup file no larger than 16 MB.");
      apply(JSON.parse(await file.text()));
    } catch (error) {
      controls["design-status"].textContent = error.name === "QuotaExceededError"
        ? "There is not enough local storage to import this file." : error.message;
    }
  };
}

libraryControl("design-share").onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    finishInlineText(true);
    const { name, folder, tags } = library.designs[library.active];
    const design = { format: "labelit-design", version: designFileVersion, design: { name, folder, tags, label } };
    const saved = await saveExport(`${fileName(name)}.labelit`,
      new Blob([JSON.stringify(design)], { type: "application/json" }));
    controls.status.textContent = saved ? "Design exported." : "Design export cancelled.";
  } catch (error) {
    controls.status.textContent = `Design export failed. ${error.message ?? error}`;
  } finally {
    button.disabled = false;
  }
};

importLibraryFile("design-import", "design-import-file", file => {
  if (file?.format !== "labelit-design" || file.version !== designFileVersion) throw new Error("Choose an editable Label-IT design file.");
  const { name, label: design, folder, tags } = readDesignEntry(file.design);
  createDesign(name, design, { folder, tags });
});

const glabelsFile = libraryControl("glabels-import-file");
libraryControl("glabels-import").onclick = () => glabelsFile.click();
glabelsFile.onchange = async () => {
  const file = glabelsFile.files[0];
  glabelsFile.value = "";
  if (!file) return;
  finishInlineText(true);
  showInspector("designs");
  try {
    const { name, label: design, warnings } = await readGlabelsDesign(file);
    const count = library.designs.length;
    createDesign(name, design);
    if (library.designs.length > count) controls["design-status"].textContent = ["Imported gLabels design.", ...warnings].join(" ");
  } catch (error) {
    controls["design-status"].textContent = error.message;
  }
};

libraryControl("library-backup").onclick = () => {
  finishInlineText(true);
  try {
    const profiles = Object.keys(localStorage).filter(isPrintProfileKey).map(key => [key, localStorage.getItem(key)]);
    downloadLibraryFile("Label-IT backup", "labelit-backup", {
      format: "labelit-backup", version: 1, designs: library.designs,
      lists: JSON.parse(localStorage.getItem(dataListKey) ?? "[]"), profiles
    });
  } catch (error) {
    controls["design-status"].textContent = `Could not export the library. ${error.message}`;
  }
};

importLibraryFile("library-restore", "library-restore-file", file => {
  const backup = readBackup(file);
  if (localStorage.getItem(storageKey) !== storedLibrary) throw new Error("The design library changed. Reload before restoring.");
  const ids = new Map();
  const designs = [...library.designs, ...backup.designs.map(entry => {
    const id = crypto.randomUUID();
    if (entry.id) ids.set(entry.id, id);
    return { ...entry, id };
  })];
  const lists = JSON.parse(localStorage.getItem(dataListKey) ?? "[]");
  for (const list of backup.lists) {
    const originalName = list.name || "Restored list";
    let name = originalName;
    let suffix = 2;
    while (lists.some(existing => existing.name.toLowerCase() === name.toLowerCase())) name = `${originalName} ${suffix++}`;
    const remap = entries => Object.fromEntries(Object.entries(entries ?? {})
      .filter(([key]) => ids.has(key)).map(([key, value]) => [ids.get(key), value]));
    lists.push({ ...list, id: crypto.randomUUID(), name, mappings: remap(list.mappings), lastRanges: remap(list.lastRanges) });
  }
  const next = { ...library, designs };
  const profiles = backup.profiles.filter(([key]) => localStorage.getItem(key) === null);
  const changes = new Map([
    ...profiles, [dataListKey, JSON.stringify(lists)], [storageKey, JSON.stringify(next)]
  ]);
  const previous = [...changes.keys()].map(key => [key, localStorage.getItem(key)]);
  try {
    for (const [key, value] of changes) localStorage.setItem(key, value);
  } catch (error) {
    for (const key of changes.keys()) localStorage.removeItem(key);
    for (const [key, value] of previous) if (value !== null) localStorage.setItem(key, value);
    throw error;
  }
  storedLibrary = changes.get(storageKey);
  saveIndicator.hidden = false;
  library = next;
  syncLibraryControls();
  if (invoke) {
    loadedStock = undefined;
    loadOffsets();
    schedulePreview();
  }
  controls["design-status"].textContent = `Restored ${backup.designs.length} designs and ${backup.lists.length} lists. Existing items were kept.`;
});

controls["new-design"].onclick = () => createDesign("Untitled label", { ...startingLabel, elements: [] });
controls["duplicate-design"].onclick = () => {
  const name = library.designs[library.active].name.slice(0, 65);
  createDesign(`${name} copy`, label);
};

function showInspector(view, reveal = false) {
  const switching = controls[`${view}-panel`].hidden;
  for (const tab of ["designs", "properties"]) {
    const active = tab === view;
    controls[`${tab}-tab`].setAttribute("aria-selected", String(active));
    controls[`${tab}-tab`].tabIndex = active ? 0 : -1;
    controls[`${tab}-panel`].hidden = !active;
  }
  if (reveal || switching) controls[`${view}-tab`].closest(".creation-panel").scrollTop = 0;
}

const pieCardHighlights = new WeakMap();
function highlightPieInspector(view) {
  showInspector(view);
  const card = controls[`${view}-panel`].closest(".panel-card");
  card.scrollIntoView({ block: "nearest", inline: "nearest" });
  pieCardHighlights.get(card)?.cancel();
  const highlight = "inset 0 0 0 2px var(--card-accent)";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  pieCardHighlights.set(card, card.animate(
    [{ boxShadow: highlight }, { boxShadow: reducedMotion ? highlight : "inset 0 0 0 2px transparent" }],
    { duration: 850, easing: "ease-out" }
  ));
}

for (const view of ["designs", "properties"]) {
  const tab = controls[`${view}-tab`];
  tab.onclick = () => showInspector(view, true);
  tab.onkeydown = event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "properties" : event.key === "End" ? "designs"
      : view === "designs" ? "properties" : "designs";
    showInspector(next);
    controls[`${next}-tab`].focus();
  };
}

function snapshot() {
  return { label: structuredClone(label), selected };
}

function change(apply) {
  cancelDrag();
  past.push(snapshot());
  if (past.length > 50) past.shift();
  future.length = 0;
  apply();
  multiSelection.clear();
  save();
}

function restore(from, to) {
  if (!from.length) return;
  cancelDrag();
  to.push(snapshot());
  ({ label, selected } = from.pop());
  multiSelection.clear();
  save();
}

controls.undo.onclick = () => restore(past, future);
controls.redo.onclick = () => restore(future, past);
document.querySelector("#stock-website").onchange = updateStockFilter;
controls.preset.onchange = () => {
  if (controls.preset.value === "custom") {
    document.querySelector("#stock-options").open = true;
    controls.width.focus();
    return;
  }
  const [width, height] = controls.preset.value.split(",").map(Number);
  const radius = controls.preset.selectedOptions[0].dataset.radius;
  const isCard = ["85,55", "88.9,50.8"].includes(controls.preset.value);
  change(() => {
    const wasRound = label.width === label.height && cornerRadius(label) === label.width / 2;
    Object.assign(label, { width, height });
    if (isCard) Object.assign(label, { media: "sheet", cornerRadius: 0 });
    if (radius !== undefined) label.cornerRadius = Number(radius);
    else if (wasRound) label.cornerRadius = 0;
  });
};
document.querySelector("#corner-radius").onchange = event => {
  const radius = validNumber(event.target);
  if (radius !== undefined && radius !== cornerRadius(label)) change(() => { label.cornerRadius = radius; });
  else syncControls();
};
for (const key of ["width", "height", "dpi", "x", "y", "size"]) {
  if (key === "width" || key === "height") controls[key].oninput = schedulePreview;
  controls[key].onchange = () => {
    const value = validNumber(controls[key]);
    if (value !== undefined) {
      const target = ["width", "height", "dpi"].includes(key) ? label : label.elements[selected];
      if (target && target[key] !== value) change(() => { target[key] = value; });
    }
    syncControls();
  };
}
controls["font-family"].onchange = () => {
  const element = label.elements[selected];
  const family = controls["font-family"].value;
  if (isText(element) && !element.locked && family !== textFontFamily(element)) {
    updateElement(selected, { fontFamily: family });
  }
};
controls.add.onclick = () => change(() => {
  selected = label.elements.push({ text: "New text", x: 2, y: 2, size: 4 }) - 1;
  showInspector("properties");
  queueMicrotask(() => controls["font-family"].focus());
});
controls["add-barcode"].onclick = () => change(() => {
  selected = label.elements.push({
    type: "barcode", text: "123", x: 0, y: Math.min(14, Math.max(0, label.height - 10)), size: 10
  }) - 1;
  showInspector("properties");
});
mediaMode.onchange = () => {
  change(() => {
    label.media = mediaMode.value;
    if (label.media === "continuous") label.cornerRadius = 0;
    if (label.media === "inkjet") applyInkjetStock(activeInkjetStock());
  });
  if (label.media === "continuous") {
    document.querySelector("#stock-options").open = true;
    controls.height.focus();
  }
};
shapeHeight.onchange = () => {
  const height = validNumber(shapeHeight);
  const element = label.elements[selected];
  if (height !== undefined && element?.type === "shape" && !element.locked) updateElement(selected, { height });
  else syncControls();
};
function addShape(shape) {
  change(() => {
    multiSelection.clear();
    selected = label.elements.push({
      type: "shape", shape, x: 1, y: 1,
      size: Math.min(20, label.width - 2),
      height: shape === "line" ? 0.3 : Math.min(10, label.height - 2)
    }) - 1;
    showInspector("properties");
  });
}

const shapeFlyout = document.querySelector("#shape-flyout");
const shapeTrigger = document.querySelector('[data-add-shape="rectangle"]');
let shapeHold;
let shapePress;
let heldShape = false;

function closeShapeFlyout() {
  shapeFlyout.hidden = true;
  shapeTrigger.setAttribute("aria-expanded", "false");
}

function openShapeFlyout(focus = false) {
  shapeFlyout.hidden = false;
  shapeTrigger.setAttribute("aria-expanded", "true");
  const rect = shapeTrigger.getBoundingClientRect();
  shapeFlyout.style.left = `${Math.max(8, Math.min(rect.right + 6, innerWidth - shapeFlyout.offsetWidth - 8))}px`;
  shapeFlyout.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - shapeFlyout.offsetHeight - 8))}px`;
  if (focus) shapeFlyout.querySelector("button").focus();
}

for (const [key, { name, symbol }] of Object.entries(extraShapes)) {
  const button = document.createElement("button");
  const icon = document.createElement("span");
  button.type = "button";
  icon.textContent = symbol;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, name);
  button.onclick = () => {
    closeShapeFlyout();
    addShape(key);
    shapeTrigger.focus({ preventScroll: true });
  };
  shapeFlyout.append(button);
}

for (const button of document.querySelectorAll("[data-add-shape]")) {
  button.onclick = () => {
    if (button === shapeTrigger && heldShape) {
      heldShape = false;
      return;
    }
    closeShapeFlyout();
    addShape(button.dataset.addShape);
  };
}

function cancelShapeHold() {
  clearTimeout(shapeHold);
  shapePress = undefined;
}
shapeTrigger.onpointerdown = event => {
  if (event.button !== 0 || !event.isPrimary) return;
  cancelShapeHold();
  heldShape = false;
  shapePress = { x: event.clientX, y: event.clientY };
  shapeHold = setTimeout(() => {
    heldShape = true;
    openShapeFlyout();
  }, 400);
};
shapeTrigger.onpointermove = event => {
  if (shapePress && Math.hypot(event.clientX - shapePress.x, event.clientY - shapePress.y) > 5) cancelShapeHold();
};
shapeTrigger.onpointerup = cancelShapeHold;
shapeTrigger.onpointercancel = cancelShapeHold;
shapeTrigger.onpointerleave = cancelShapeHold;
shapeTrigger.oncontextmenu = event => {
  event.preventDefault();
  cancelShapeHold();
  openShapeFlyout(true);
};
shapeTrigger.onkeydown = event => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  openShapeFlyout(true);
};
document.addEventListener("pointerdown", event => {
  if (!shapeFlyout.contains(event.target) && !shapeTrigger.contains(event.target)) closeShapeFlyout();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || shapeFlyout.hidden) return;
  event.preventDefault();
  closeShapeFlyout();
  shapeTrigger.focus();
});
controls["add-image"].onclick = () => controls["image-file"].click();
controls["image-file"].onchange = async () => {
  const activeDesign = label;
  const input = controls["image-file"];
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      throw new Error("Choose a PNG, JPEG, or WebP file up to 10 MB.");
    }
    const bitmap = await createImageBitmap(file);
    const ratio = bitmap.height / bitmap.width;
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(bitmap.width * scale));
    resized.height = Math.max(1, Math.round(bitmap.height * scale));
    try {
      resized.getContext("2d").drawImage(bitmap, 0, 0, resized.width, resized.height);
    } finally {
      bitmap.close();
    }
    const source = resized.toDataURL("image/webp", 0.9);
    if (label !== activeDesign) {
      controls.status.textContent = "Image import stopped because you opened a different design.";
      return;
    }
    change(() => {
      const size = Math.max(1, Math.floor(Math.min(label.width - 2, (label.height - 2) / ratio, 30) * 10) / 10);
      selected = label.elements.push({ type: "image", name: file.name, source, ratio, x: 1, y: 1, size }) - 1;
      showInspector("properties");
    });
  } catch (error) {
    controls.status.textContent = `Image import failed. ${error.message}`;
  }
};
function deleteSelection() {
  const indices = selectionIndices();
  if (!indices.length) return;
  const removed = new Set(indices);
  closePieMenu(true);
  change(() => {
    const first = Math.min(...indices);
    label.elements = label.elements.filter((_, index) => !removed.has(index));
    selected = Math.min(first, label.elements.length - 1);
  });
}

controls.remove.onclick = deleteSelection;
function toggleElementLock() {
  const element = label.elements[selected];
  if (element) updateElement(selected, { locked: !element.locked });
}
document.querySelector("#lock-element").onclick = toggleElementLock;
controls.elements.onchange = () => {
  cancelDrag();
  multiSelection.clear();
  selected = controls.elements.selectedIndex;
  syncControls();
};
controls.content.oninput = schedulePreview;
controls.content.onchange = () => {
  const element = label.elements[selected];
  if (!isText(element) && element?.type !== "barcode") return;
  const value = element.type === "barcode" ? normaliseBarcode(controls.content.value, element.format) : controls.content.value;
  if (element.type === "barcode" && !isBarcodeValue(value, element.format)) {
    controls.content.value = element.text;
    controls.status.textContent = `Enter a valid ${barcodeNames[element.format ?? "code39"]} value.`;
    schedulePreview();
    return;
  }
  if (element.text !== value) change(() => { element.text = value; });
  else controls.content.value = value;
};
document.querySelector("#barcode-format").onchange = event => {
  const element = label.elements[selected];
  if (element?.type !== "barcode" || element.locked) return;
  const format = event.target.value;
  const text = normaliseBarcode(element.text, format);
  if (!isBarcodeValue(text, format)) {
    controls.status.textContent = `The current value cannot be used with ${barcodeNames[format]}.`;
    event.target.value = element.format ?? "code39";
    return;
  }
  updateElement(selected, { format, text });
};

const canvas = controls.preview;
const canvasTools = document.getElementById("canvas-tools").content.cloneNode(true);
const inlineText = canvasTools.querySelector(".inline-text");
const pieMenu = canvasTools.querySelector(".pie-menu");
const pieItems = Array.from(pieMenu.querySelectorAll("[data-action]"));
const pieHub = pieMenu.querySelector(".pie-hub");
controls.stage.append(canvasTools);

function startInlineText(index, point) {
  finishInlineText(true);
  const element = index < 0 ? {
    x: roundPosition(point.x), y: roundPosition(point.y), size: 4, text: ""
  } : label.elements[index];
  inlineEdit = { index, element };
  showInspector("properties", true);
  inlineText.value = element.text;
  inlineText.hidden = false;
  positionInlineText();
  inlineText.focus({ preventScroll: true });
  inlineText.select();
  schedulePreview();
}

function positionInlineText() {
  if (!inlineEdit) return;
  const { element } = inlineEdit;
  const context = canvas.getContext("2d");
  const layout = layoutText(context, { ...element, text: inlineText.value });
  const origin = stageOrigin();
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / label.width;
  const scaleY = rect.height / label.height;
  const stretch = (element.scaleX ?? 1) * scaleX / scaleY;
  const width = Math.max(layout.width * scaleX, inlineText.value ? 0 : 120);
  const height = layout.lines.length * layout.size * scaleY * 1.2;
  inlineText.classList.toggle("canvas-text-draft", element.x >= 0 && element.y >= 0
    && element.x + layout.width <= label.width && element.y + layout.height <= label.height);
  inlineText.style.left = `${origin.x + element.x * scaleX}px`;
  inlineText.style.top = `${origin.y + element.y * scaleY - layout.size * scaleY * 0.1}px`;
  inlineText.style.width = `${width / stretch}px`;
  inlineText.style.height = `${height}px`;
  inlineText.style.fontSize = `${layout.size * scaleY}px`;
  inlineText.style.fontFamily = textFontFamily(element);
  inlineText.style.textAlign = element.textAlign ?? "left";
  inlineText.style.transform = `scaleX(${stretch})`;
  inlineText.style.whiteSpace = element.wrapWidth ? "pre-wrap" : "pre";
}

function finishInlineText(commit) {
  if (!inlineEdit) return;
  const { index, element } = inlineEdit;
  const text = inlineText.value;
  inlineEdit = undefined;
  inlineText.hidden = true;
  if (commit && index < 0 && text.trim()) {
    change(() => { selected = label.elements.push({ ...element, text }) - 1; });
    showInspector("properties");
  } else if (commit && index >= 0 && text !== element.text) {
    updateElement(index, { text });
  }
  schedulePreview();
}

inlineText.onblur = () => finishInlineText(true);
inlineText.oninput = () => {
  positionInlineText();
  schedulePreview();
};
inlineText.onkeydown = event => {
  if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
    event.preventDefault();
    finishInlineText(event.key !== "Escape");
    canvas.focus({ preventScroll: true });
  }
};

function closePieMenu(restoreFocus = false) {
  if (!pieMenu.hasAttribute("data-open")) return;
  pieMenu.removeAttribute("data-open");
  if (restoreFocus) canvas.focus({ preventScroll: true });
  pieMenu.inert = true;
  pieMenu.setAttribute("aria-hidden", "true");
}

function showPieMenu(index, clientX, clientY, point) {
  finishInlineText(true);
  if (!selectionIndices().includes(index)) multiSelection.clear();
  selected = index;
  syncControls();
  pastePoint = point;
  setPiePage(index < 0 ? "insert" : "element");
  const stage = controls.stage.getBoundingClientRect();
  const viewport = stageViewport.getBoundingClientRect();
  const radius = pieMenu.offsetWidth / 2 + 4;
  const fit = (value, lower, upper) => upper - lower < radius * 2
    ? (lower + upper) / 2 : Math.max(lower + radius, Math.min(upper - radius, value));
  const x = fit(clientX, Math.max(stage.left, viewport.left), Math.min(stage.right, viewport.right));
  const y = fit(clientY, Math.max(stage.top, viewport.top), Math.min(stage.bottom, viewport.bottom));
  pieMenu.style.left = `${x - stage.left}px`;
  pieMenu.style.top = `${y - stage.top}px`;
  pieMenu.inert = false;
  pieMenu.setAttribute("aria-hidden", "false");
  pieMenu.setAttribute("data-open", "");
  focusPieAction();
}

let piePage = "element";
let pieParent;
const pieShortLabels = {
  barcode: "Barcode", image: "Image", designs: "Find", proof: "Preview",
  align: "Align", front: "To front", back: "To back", group: "Group",
  "y-0": "Top", "x-1": "Right", "y-0.5": "Middle", "y-1": "Bottom", "x-0": "Left", "x-0.5": "Centre"
};
function setPiePage(page) {
  piePage = page;
  pieParent = { align: "arrange", arrange: "element" }[page];
  const element = label.elements[selected];
  const locked = Boolean(element?.locked);
  const copy = ["copy", "⧉", "Copy"];
  const paste = ["paste", "▣", "Paste", !copiedElement];
  const actions = {
    element: [
      ["edit", "✎", isText(element) && !locked ? "Edit text" : "Properties"],
      copy, paste, ["delete", "×", "Delete"],
      ["arrange", "↔", "Arrange"],
      ["duplicate", "＋", "Duplicate"]
    ],
    insert: [
      ["text", "T", "Add text"], ["barcode", "▥", "Add barcode"], paste,
      ["image", "▧", "Add image"], ["designs", "▤", "Find designs"], ["proof", "◉", "Print preview"]
    ],
    arrange: [
      ["align", "↔", "Align to label", locked],
      ["front", "↑", "Bring to front", locked || selected === label.elements.length - 1],
      ["back", "↓", "Send to back", locked || selected === 0],
      ["lock", locked ? "◇" : "◆", locked ? "Unlock element" : "Lock element"],
      ["group", "⊞", "Group selection", !canGroup()],
      ["ungroup", "⊟", "Ungroup", !element?.group || selectionIndices().some(index => label.elements[index].locked)]
    ],
    align: [
      ["y-0", "↑", "Align top"], ["x-1", "→", "Align right"],
      ["y-0.5", "↕", "Centre vertically"], ["y-1", "↓", "Align bottom"],
      ["x-0", "←", "Align left"], ["x-0.5", "↔", "Centre horizontally"]
    ]
  }[page];
  pieItems.forEach((item, index) => {
    const entry = actions[index];
    item.hidden = !entry;
    item.disabled = !entry || Boolean(entry[3]);
    if (!entry) return;
    item.dataset.action = entry[0];
    item.setAttribute("aria-label", entry[2]);
    item.style.setProperty("--angle", `${index * 60}deg`);
    item.querySelector(".pie-icon").textContent = entry[1];
    item.querySelector(".pie-label").textContent = entry[0] === "lock" ? (locked ? "Unlock" : "Lock")
      : pieShortLabels[entry[0]] ?? entry[2];
  });
  pieMenu.setAttribute("aria-label", { element: "Element actions", insert: "Insert actions", arrange: "Arrange element", align: "Align to label" }[page]);
  pieHub.disabled = !pieParent;
  pieHub.textContent = pieParent ? "Back" : page === "insert" ? "Insert" : "Actions";
}

function focusPieAction() {
  pieItems.find(item => !item.disabled)?.focus({ preventScroll: true });
}

function navigatePie(page) {
  setPiePage(page);
  focusPieAction();
}

pieHub.onclick = () => { if (pieParent) navigatePie(pieParent); };

function isText(element) {
  return element && (element.type === undefined || element.type === "text");
}

function copyElement(element) {
  copiedElement = structuredClone(element);
  controls.status.textContent = "Element copied. Open another design or paste it here.";
}

function pasteElement(point = copiedElement) {
  if (!copiedElement) return;
  const x = roundPosition(Math.max(0, Math.min(label.width - 1, point.x)));
  const y = roundPosition(Math.max(0, Math.min(label.height - 1, point.y)));
  change(() => {
    selected = label.elements.push({ ...structuredClone(copiedElement), id: undefined, group: undefined, locked: false, x, y }) - 1;
  });
}

for (const item of pieItems) {
  const showAction = () => { pieHub.textContent = item.getAttribute("aria-label"); };
  item.onpointerenter = showAction;
  item.onfocus = () => { if (item.matches(":focus-visible")) showAction(); };
  item.onpointerleave = () => {
    if (!item.matches(":focus-visible")) pieHub.textContent = pieParent ? "Back" : piePage === "insert" ? "Insert" : "Actions";
  };
  item.onclick = () => {
    const action = item.dataset.action;
    if (action === "arrange" || action === "align") {
      navigatePie(action);
      return;
    }
    const element = label.elements[selected];
    closePieMenu(true);
    if (action === "paste") return pasteElement(pastePoint);
    if (action === "text") return pastePoint ? startInlineText(-1, pastePoint) : controls.add.click();
    if (action === "barcode") return controls["add-barcode"].click();
    if (action === "image") return controls["add-image"].click();
    if (action === "proof") return document.querySelector("#print-proof-open").click();
    if (action === "designs") {
      highlightPieInspector("designs");
      controls["design-search"].focus();
      return;
    }
    if (piePage === "align") {
      const [axis, align] = action.split("-");
      alignElement(axis, align);
      return;
    }
    if (!element) return;
    switch (item.dataset.action) {
      case "edit":
        if (isText(element) && !element.locked) startInlineText(selected);
        else {
          highlightPieInspector("properties");
          controls["properties-tab"].focus();
        }
        break;
      case "duplicate":
        change(() => {
          const copy = { ...element, id: undefined, group: undefined, locked: false, x: roundPosition(element.x + 1), y: roundPosition(element.y + 1) };
          selected = label.elements.push(copy) - 1;
        });
        break;
      case "copy":
        copyElement(element);
        break;
      case "delete":
        controls.remove.click();
        break;
      case "lock":
        toggleElementLock();
        break;
      case "group":
        groupSelection();
        break;
      case "ungroup":
        ungroupSelection();
        break;
      case "front":
      case "back":
        change(() => {
          label.elements.splice(selected, 1);
          if (action === "front") selected = label.elements.push(element) - 1;
          else {
            label.elements.unshift(element);
            selected = 0;
          }
        });
        break;
    }
  };
}

pieMenu.onkeydown = event => {
  if (event.key === "Escape" || event.key === "Tab") {
    event.preventDefault();
    if (event.key === "Escape" && pieParent) navigatePie(pieParent);
    else closePieMenu(true);
  } else if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    event.preventDefault();
    const enabled = pieItems.filter(item => !item.disabled);
    const index = enabled.indexOf(document.activeElement);
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    enabled[(index + step + enabled.length) % enabled.length]?.focus();
  }
};

document.addEventListener("pointerdown", event => {
  if (!pieMenu.contains(event.target)) closePieMenu();
}, true);

canvas.ondblclick = event => {
  const point = labelPoint(event);
  const index = elementAt(point, canvas.getContext("2d"));
  if (index < 0 || (isText(label.elements[index]) && !label.elements[index].locked)) {
    closePieMenu();
    selected = index;
    syncControls();
    startInlineText(index, point);
  }
};

canvas.oncontextmenu = event => {
  const point = labelPoint(event);
  const index = elementAt(point, canvas.getContext("2d"));
  event.preventDefault();
  showPieMenu(index, event.clientX, event.clientY, point);
};
const rulers = ["horizontal", "vertical"].map(axis => {
  const ruler = document.createElement("div");
  ruler.className = `ruler ruler-${axis}`;
  ruler.setAttribute("aria-hidden", "true");
  controls.stage.append(ruler);
  return ruler;
});
const rulerKeys = [];

function drawRulers(design, width, height) {
  const origin = stageOrigin();
  for (const [index, ruler] of rulers.entries()) {
    const horizontal = index === 0;
    const length = horizontal ? width : height;
    const extent = horizontal ? design.width : design.height;
    const scale = length / extent;
    ruler.style.left = `${origin.x - (horizontal ? 0 : 24)}px`;
    ruler.style.top = `${origin.y - (horizontal ? 24 : 0)}px`;
    ruler.style[horizontal ? "width" : "height"] = `${length}px`;
    const key = `${extent}:${length}`;
    if (rulerKeys[index] === key) continue;
    rulerKeys[index] = key;
    const major = [5, 10, 20, 50, 100].find(step => step * scale >= 40) ?? 200;
    const minor = scale >= 4 ? 1 : major / 5;
    const ticks = document.createDocumentFragment();
    for (let mm = 0; mm <= extent; mm += minor) {
      const tick = document.createElement("span");
      tick.className = mm % major === 0 ? "ruler-tick major" : "ruler-tick";
      tick.style[horizontal ? "left" : "top"] = `${mm * scale}px`;
      if (mm % major === 0 && (extent - mm) * scale >= 20) tick.textContent = mm;
      ticks.append(tick);
    }
    ruler.replaceChildren(ticks);
  }
}

function stageOrigin() {
  const stageRect = controls.stage.getBoundingClientRect();
  const labelRect = canvas.getBoundingClientRect();
  return { x: labelRect.left - stageRect.left, y: labelRect.top - stageRect.top };
}

function drawAlignmentGuides(context, design, scale, guides) {
  context.strokeStyle = "#c026d3";
  context.lineWidth = 1 / scale;
  context.setLineDash([4 / scale, 3 / scale]);
  context.beginPath();
  if (guides.x !== undefined) {
    context.moveTo(guides.x, 0);
    context.lineTo(guides.x, design.height);
  }
  if (guides.y !== undefined) {
    context.moveTo(0, guides.y);
    context.lineTo(design.width, guides.y);
  }
  context.stroke();
  context.setLineDash([]);
}

function snapAxis(position, size, targets, threshold) {
  let nearest = threshold;
  let guide;
  let snapped = position;
  for (const offset of [0, size / 2, size]) {
    for (const target of targets) {
      const distance = Math.abs(target - (position + offset));
      if (distance < nearest) {
        nearest = distance;
        guide = target;
        snapped = target - offset;
      }
    }
  }
  return { position: roundPosition(snapped), guide };
}
const ghostSelection = document.createElement("div");
ghostSelection.className = "ghost-selection";
ghostSelection.hidden = true;
ghostSelection.setAttribute("aria-hidden", "true");
ghostSelection.onpointerdown = event => {
  if (event.target === ghostSelection) startPointer(event);
};
ghostSelection.oncontextmenu = event => {
  if (selected < 0) return;
  event.preventDefault();
  showPieMenu(selected, event.clientX, event.clientY, labelPoint(event));
};
ghostSelection.ondblclick = event => {
  if (event.target === ghostSelection && isText(label.elements[selected])) {
    closePieMenu();
    startInlineText(selected);
  }
};
const ghostHandles = corners.map(([horizontal, vertical]) => {
  const handle = document.createElement("div");
  handle.className = "ghost-handle";
  handle.style.left = horizontal < 0 ? "0" : "100%";
  handle.style.top = vertical < 0 ? "0" : "100%";
  handle.style.cursor = horizontal === vertical ? "nwse-resize" : "nesw-resize";
  handle.onpointerdown = event => startPointer(event, { horizontal, vertical });
  ghostSelection.append(handle);
  return handle;
});
controls.stage.append(ghostSelection);

function drawGhostSelection(bounds, scaleX, scaleY) {
  const stage = controls.stage;
  const origin = stageOrigin();
  const left = origin.x + bounds.x * scaleX;
  const top = origin.y + bounds.y * scaleY;
  const right = left + bounds.width * scaleX;
  const bottom = top + bounds.height * scaleY;
  // Keep the grab points accessible even when the true corners leave the workspace.
  const inset = 8;
  const clamp = (value, extent) => Math.max(inset, Math.min(extent - inset, value));
  const visibleLeft = clamp(left, stage.clientWidth);
  const visibleTop = clamp(top, stage.clientHeight);
  const visibleRight = clamp(right, stage.clientWidth);
  const visibleBottom = clamp(bottom, stage.clientHeight);
  ghostSelection.style.left = `${visibleLeft}px`;
  ghostSelection.style.top = `${visibleTop}px`;
  ghostSelection.style.width = `${Math.max(1, visibleRight - visibleLeft)}px`;
  ghostSelection.style.height = `${Math.max(1, visibleBottom - visibleTop)}px`;
  // When corners collapse against an edge, preserve the handle facing the label.
  ghostHandles.forEach((handle, index) => {
    const [horizontal, vertical] = corners[index];
    handle.hidden = (visibleLeft === visibleRight && horizontal !== (right <= inset ? 1 : -1))
      || (visibleTop === visibleBottom && vertical !== (bottom <= inset ? 1 : -1));
  });
  ghostSelection.hidden = false;
}

function labelPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * label.width / rect.width,
    y: (event.clientY - rect.top) * label.height / rect.height
  };
}

function updateElement(index, properties) {
  const element = label.elements[index];
  if (element && Object.keys(properties).some(key => element[key] !== properties[key])) {
    change(() => Object.assign(element, properties));
  }
}

const roundPosition = value => Math.round(value * 10) / 10;
const textBoxControls = [
  ["wrapWidth", document.querySelector("#text-wrap")],
  ["fitHeight", document.querySelector("#text-fit")],
  ["minimumSize", document.querySelector("#text-minimum")]
];
const textAlignment = document.querySelector("#text-alignment");
const textMode = document.querySelector("#text-mode");
textMode.onchange = () => {
  const element = label.elements[selected];
  if (!isText(element) || element.locked) return;
  const availableWidth = label.width - Math.max(0, element.x);
  const wrapWidth = textMode.value === "paragraph" ? Math.max(1, roundPosition(availableWidth)) : undefined;
  updateElement(selected, { wrapWidth });
  if (wrapWidth !== undefined) document.querySelector("#text-box-settings").open = true;
};
textAlignment.onchange = () => {
  const element = label.elements[selected];
  if (isText(element) && !element.locked) updateElement(selected, { textAlign: textAlignment.value });
};
for (const [property, input] of textBoxControls) {
  input.onchange = () => {
    const element = label.elements[selected];
    if (!isText(element) || element.locked) return;
    if (!input.reportValidity()) {
      input.value = element[property] ?? "";
      return;
    }
    updateElement(selected, { [property]: input.value === "" ? undefined : input.valueAsNumber });
  };
}
document.querySelector("#align-element").onclick = event => {
  const button = event.target.closest("button");
  if (!button || selected < 0) return;
  if ("centerRows" in button.dataset) {
    const rows = selectionIndices().map(index => label.elements[index])
      .filter(element => isText(element) && !element.locked);
    const context = canvas.getContext("2d");
    const positions = rows.map(element => roundPosition((label.width - elementBounds(context, element).width) / 2));
    if (rows.some((element, index) => element.x !== positions[index])) {
      change(() => rows.forEach((element, index) => { element.x = positions[index]; }));
    }
    return;
  }
  alignElement(button.dataset.axis, button.dataset.align);
};

function alignElement(axis, align) {
  const indices = selectionIndices();
  if (!indices.length || indices.some(index => label.elements[index].locked)) return;
  const dimension = axis === "x" ? "width" : "height";
  const bounds = selectionBounds(canvas.getContext("2d"), label, indices);
  const space = label[dimension] - bounds[dimension];
  const position = align === "1" ? Math.floor(space * 10) / 10 : roundPosition(space * Number(align));
  if (indices.length === 1) updateElement(selected, { [axis]: position });
  else moveSelection(indices, axis === "x" ? position - bounds.x : 0, axis === "y" ? position - bounds.y : 0);
}

function selectionIndices() {
  const indices = new Set(multiSelection);
  if (label.elements[selected]) indices.add(selected);
  const groups = new Set([...indices].map(index => label.elements[index]?.group).filter(Boolean));
  label.elements.forEach((element, index) => { if (groups.has(element.group)) indices.add(index); });
  return [...indices].filter(index => label.elements[index]);
}

function selectionBounds(context, design, indices) {
  const bounds = indices.map(index => elementBounds(context, design.elements[index]));
  const x = Math.min(...bounds.map(bound => bound.x));
  const y = Math.min(...bounds.map(bound => bound.y));
  return { x, y, width: Math.max(...bounds.map(bound => bound.x + bound.width)) - x,
    height: Math.max(...bounds.map(bound => bound.y + bound.height)) - y };
}

function canGroup() {
  const indices = selectionIndices();
  return indices.length > 1 && !indices.some(index => label.elements[index].locked)
    && new Set(indices.map(index => label.elements[index].group)).size > (label.elements[selected]?.group ? 1 : 0);
}

function groupSelection() {
  if (!canGroup()) return;
  const indices = selectionIndices();
  const group = crypto.randomUUID();
  change(() => { for (const index of indices) label.elements[index].group = group; });
}

function ungroupSelection() {
  const group = label.elements[selected]?.group;
  if (!group) return;
  const elements = label.elements.filter(element => element.group === group);
  if (elements.some(element => element.locked)) return;
  change(() => { for (const element of elements) delete element.group; });
}

function moveSelection(indices, dx, dy) {
  if ((!dx && !dy) || indices.some(index => label.elements[index].locked)) return;
  change(() => {
    for (const index of indices) {
      const element = label.elements[index];
      element.x = roundPosition(element.x + dx);
      element.y = roundPosition(element.y + dy);
    }
  });
}
const maximumSize = element => ["image", "shape"].includes(element?.type) ? 220 : 40;
const scaledSize = (element, factor) => roundPosition(Math.max(1, Math.min(maximumSize(element), element.size * factor)));

function handleAt(point, element, context) {
  if (!element || element.locked || selectionIndices().length > 1) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / label.width;
  const scaleY = rect.height / label.height;
  const bounds = elementBounds(context, element);
  return resizeHandles(bounds, scaleX, scaleY).find(handle => handle.visible
    && Math.abs(handle.x - point.x) * scaleX <= handleRadius + 2
    && Math.abs(handle.y - point.y) * scaleY <= handleRadius + 2);
}

function resizeFromCorner(point, proportional) {
  const { origin, bounds, handle } = drag;
  const widthChange = (point.x - drag.point.x) * handle.horizontal;
  const heightChange = (point.y - drag.point.y) * handle.vertical;
  if (!widthChange && !heightChange) return { x: origin.x, y: origin.y, size: origin.size };
  const context = canvas.getContext("2d");
  const linearBarcode = origin.type === "barcode" && !["qrcode", "datamatrix"].includes(origin.format);
  let properties;
  if (origin.type === "shape") {
    const factor = proportional ? 1 + (widthChange * bounds.width + heightChange * bounds.height)
      / (bounds.width ** 2 + bounds.height ** 2) : undefined;
    properties = {
      size: roundPosition(Math.max(1, Math.min(220, proportional ? bounds.width * factor : bounds.width + widthChange))),
      height: roundPosition(Math.max(0.2, Math.min(300, proportional ? bounds.height * factor : bounds.height + heightChange)))
    };
  } else if (proportional || (origin.type === "barcode" && !linearBarcode)) {
    const distance = widthChange * bounds.width + heightChange * bounds.height;
    const diagonalSquared = bounds.width ** 2 + bounds.height ** 2;
    const factor = 1 + distance / diagonalSquared;
    properties = { size: scaledSize(origin, factor) };
    if (linearBarcode) properties.scaleX = barcodeWidthScale(origin, factor);
  } else if (linearBarcode) {
    properties = {
      size: scaledSize(origin, 1 + heightChange / bounds.height),
      scaleX: barcodeWidthScale(origin, 1 + widthChange / bounds.width)
    };
  } else {
    const width = Math.max(1, bounds.width + widthChange);
    const height = Math.max(0.1, bounds.height + heightChange);
    if (origin.type === "image") {
      const size = scaledSize(origin, width / bounds.width);
      properties = { size, ratio: height / size };
    } else {
      const size = scaledSize(origin, height / bounds.height);
      const naturalWidth = elementBounds(context, { ...origin, size, scaleX: 1 }).width;
      properties = { size, scaleX: width / naturalWidth };
    }
  }
  const resized = elementBounds(context, { ...origin, ...properties });
  return {
    ...properties,
    x: handle.horizontal < 0 ? roundPosition(origin.x + bounds.width - resized.width) : origin.x,
    y: handle.vertical < 0 ? roundPosition(origin.y + bounds.height - resized.height) : origin.y
  };
}

function barcodeWidthScale(element, factor) {
  return Math.max(2 / 3, Math.min(4, (element.scaleX ?? 1) * factor));
}

function startPointer(event, ghostHandle) {
  if (event.button !== 0 || drag) return;
  const fromGhost = event.currentTarget === ghostSelection || !!ghostHandle;
  if (fromGhost) event.preventDefault();
  canvas.focus({ preventScroll: true });
  const point = labelPoint(event);
  const context = canvas.getContext("2d");
  const handle = fromGhost ? ghostHandle : handleAt(point, label.elements[selected], context);
  if (handle) {
    const origin = label.elements[selected];
    drag = { id: event.pointerId, index: selected, point, origin, handle, bounds: elementBounds(context, origin) };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (!fromGhost) {
    const hit = elementAt(point, context);
    const current = selectionIndices();
    if (event.shiftKey && hit >= 0) {
      const group = label.elements[hit].group;
      const hits = group ? label.elements.flatMap((element, index) => element.group === group ? [index] : []) : [hit];
      const next = current.includes(hit) ? current.filter(index => !hits.includes(index)) : [...current, ...hits];
      multiSelection.clear();
      for (const index of next) multiSelection.add(index);
      selected = next.at(-1) ?? -1;
      syncControls();
      return;
    }
    if (!current.includes(hit)) multiSelection.clear();
    else if (current.length > 1) for (const index of current) multiSelection.add(index);
    selected = hit;
  }
  syncControls();
  if (selected < 0) return;
  const origin = label.elements[selected];
  const indices = selectionIndices();
  if (indices.some(index => label.elements[index].locked)) return;
  const bounds = selectionBounds(context, label, indices);
  const targets = { x: [0, label.width / 2, label.width], y: [0, label.height / 2, label.height] };
  label.elements.forEach((element, index) => {
    if (indices.includes(index)) return;
    const { x, y, width, height } = elementBounds(context, element);
    targets.x.push(x, x + width / 2, x + width);
    targets.y.push(y, y + height / 2, y + height);
  });
  drag = { id: event.pointerId, index: selected, indices, point, origin, bounds, targets };
  canvas.setPointerCapture(event.pointerId);
}

function elementAt(point, context) {
  return label.elements.findLastIndex(element => {
    const { x, y, width, height } = elementBounds(context, element);
    return point.x >= x - 0.5 && point.x <= x + width + 0.5
      && point.y >= y - 0.5 && point.y <= y + height + 0.5;
  });
}

canvas.onpointerdown = event => startPointer(event);

canvas.onpointermove = event => {
  const point = labelPoint(event);
  if (!drag) {
    const handle = handleAt(point, label.elements[selected], canvas.getContext("2d"));
    canvas.style.cursor = handle
      ? (handle.horizontal === handle.vertical ? "nwse-resize" : "nesw-resize")
      : "";
    return;
  }
  if (drag.id !== event.pointerId) return;
  if (drag.handle) {
    drag.position = resizeFromCorner(point, event.shiftKey);
  } else {
    const x = drag.bounds.x + point.x - drag.point.x;
    const y = drag.bounds.y + point.y - drag.point.y;
    const rect = canvas.getBoundingClientRect();
    const tolerance = event.altKey ? 0 : 5;
    const horizontal = snapAxis(x, drag.bounds.width, drag.targets.x, tolerance * label.width / rect.width);
    const vertical = snapAxis(y, drag.bounds.height, drag.targets.y, tolerance * label.height / rect.height);
    drag.position = { x: horizontal.position, y: vertical.position };
    drag.guides = { x: horizontal.guide, y: vertical.guide };
    canvas.dataset.moving = "";
  }
  schedulePreview();
};

function endDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const { index, indices, bounds } = drag;
  const position = drag.handle && event.type === "pointerup"
    ? resizeFromCorner(labelPoint(event), event.shiftKey)
    : drag.position;
  cancelDrag();
  if (event.type === "pointerup" && position) {
    if (indices?.length > 1) moveSelection(indices, position.x - bounds.x, position.y - bounds.y);
    else updateElement(index, position);
  }
  schedulePreview();
}

function cancelDrag() {
  if (!drag) return;
  drag = undefined;
  delete canvas.dataset.moving;
  schedulePreview();
}

canvas.onpointerup = endDrag;
canvas.onpointercancel = endDrag;
canvas.onlostpointercapture = endDrag;
canvas.onpointerleave = () => { canvas.style.cursor = ""; };

const directions = new Map([
  ["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]],
  ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]]
]);
canvas.onkeydown = event => {
  const direction = directions.get(event.key);
  const element = label.elements[selected];
  if (!drag && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
    event.preventDefault();
    if (event.shiftKey) ungroupSelection();
    else groupSelection();
    return;
  }
  if (!drag && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "c" && element) {
      event.preventDefault();
      copyElement(element);
      return;
    }
    if (key === "v" && copiedElement) {
      event.preventDefault();
      pasteElement();
      return;
    }
  }
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const bounds = element ? elementBounds(canvas.getContext("2d"), element)
      : { x: 0, y: 0, width: label.width, height: label.height };
    const rect = canvas.getBoundingClientRect();
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    showPieMenu(selected, rect.left + point.x * rect.width / label.width,
      rect.top + point.y * rect.height / label.height, point);
    return;
  }
  if (!element || element.locked || drag || event.altKey || event.ctrlKey || event.metaKey) return;
  if (element.type !== "barcode" && ["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    const ratio = 1.1;
    const factor = ["+", "="].includes(event.key) ? ratio : 1 / ratio;
    updateElement(selected, { size: scaledSize(element, factor) });
    return;
  }
  if (!direction) return;
  event.preventDefault();
  const step = event.shiftKey ? 1 : 0.1;
  const indices = selectionIndices();
  if (indices.length > 1) {
    moveSelection(indices, direction[0] * step, direction[1] * step);
    return;
  }
  updateElement(selected, {
    x: roundPosition(element.x + direction[0] * step),
    y: roundPosition(element.y + direction[1] * step)
  });
};

function outsideLabel(bounds, design, offsetX = 0, offsetY = 0) {
  const x = bounds.x + offsetX;
  const y = bounds.y + offsetY;
  const radius = cornerRadius(design);
  if (x < -1e-8 || y < -1e-8 || x + bounds.width > design.width + 1e-8
      || y + bounds.height > design.height + 1e-8) return true;
  return radius > 0 && [x, x + bounds.width].some(px => [y, y + bounds.height].some(py =>
    !insideStock(Math.max(0, Math.min(design.width, px)), Math.max(0, Math.min(design.height, py)),
      design.width, design.height, radius)));
}

function barcodeWouldClip(context, design, offsetX = 0, offsetY = 0) {
  return design.elements.some(element => element.type === "barcode"
    && outsideLabel(elementBounds(context, element), design, offsetX, offsetY));
}

function textBoxOverflows(context, design) {
  return design.elements.some(element => isText(element) && (element.wrapWidth || element.fitHeight)
    && !layoutText(context, element).fits);
}

function barcodeTooSmall(design, dpi = design.dpi) {
  return design.elements.some(element => element.type === "barcode" && !barcodeAtResolution(element, dpi));
}

function printOffsets(design, feed, sideways) {
  const width = Math.round(design.width * design.dpi / millimetresPerInch);
  const height = Math.round(design.height * design.dpi / millimetresPerInch);
  const x = Math.round(sideways * width / design.width);
  const y = Math.round(feed * height / design.height);
  return { x, y, sidewaysMm: x * design.width / width, feedMm: y * design.height / height };
}

function usesFullSizeZebra(design, name, tone) {
  return design.media !== "continuous" && tone === "thermal" && name.toLowerCase() === "zdesigner zd410-203dpi zpl"
    && design.width === 50 && design.height === 30 && design.dpi === 203;
}

function artworkOffsets(design, name, offset) {
  return usesFullSizeZebra(design, name, printTone(toneControl.value, name))
    ? printOffsets(design, 0, 0) : offset;
}

function imageWouldClip(context, design, offset, area = [0, 0, design.width, design.height]) {
  const [left, top, right, bottom] = area;
  return design.elements.some(element => {
    if (element.type !== "image") return false;
    const bounds = elementBounds(context, element);
    return outsideLabel(bounds, design, offset.sidewaysMm, offset.feedMm)
      || outsideLabel(bounds, { width: right - left, height: bottom - top, cornerRadius: 0 },
        offset.sidewaysMm - left, offset.feedMm - top);
  });
}

function fitPrintImage(useFullHeight) {
  const element = label.elements[selected];
  if (element?.type !== "image" || element.locked) return;
  if (invoke && printer.value && !offsetControls.every(input => input.reportValidity())) return;
  const design = { ...label, dpi: invoke && printer.value ? Number(printDpi.value) || label.dpi : label.dpi };
  const calibrated = invoke && printer.value
    ? printOffsets(design, feedOffset.valueAsNumber, sidewaysOffset.valueAsNumber)
    : { sidewaysMm: 0, feedMm: 0 };
  const offset = artworkOffsets(design, invoke ? printer.value : "", calibrated);
  const radius = cornerRadius(design);
  const margin = useFullHeight ? 0 : 1 + radius * (1 - Math.SQRT1_2);
  const sideInset = useFullHeight ? radius : margin;
  const left = Math.ceil((sideInset + Math.max(0, -offset.sidewaysMm)) * 10) / 10;
  const top = Math.ceil((margin + Math.max(0, -offset.feedMm)) * 10) / 10;
  const right = label.width - sideInset - Math.max(0, offset.sidewaysMm);
  const bottom = label.height - margin - Math.max(0, offset.feedMm);
  const maxWidth = useFullHeight ? maximumSize(element) : element.size;
  const size = Math.floor(Math.min(maxWidth, right - left, (bottom - top) / element.ratio) * 10 + 1e-8) / 10;
  if (size < 1) {
    controls.status.textContent = "The image cannot fit at this label size and printer offset.";
    return;
  }
  const x = Math.max(left, Math.min(element.x, Math.floor((right - size) * 10) / 10));
  const y = useFullHeight ? top : Math.max(top, Math.min(element.y, Math.floor((bottom - size * element.ratio) * 10) / 10));
  updateElement(selected, { x, y, size });
  if (useFullHeight) {
    controls.status.textContent = `Whole image fits at ${(size * element.ratio).toFixed(1)} mm high with the current print settings.`;
  }
}
document.querySelector("#fit-print-image").onclick = () => fitPrintImage(false);
document.querySelector("#fill-image-height").onclick = () => fitPrintImage(true);

function updateBarcodeWarning(context, design) {
  let warning = "";
  if (barcodeWouldClip(context, design)) {
    warning = "Move the whole barcode inside the label, including the blank space on both sides.";
  } else if (invoke && printer.value && feedOffset.validity.valid && sidewaysOffset.validity.valid) {
    const printDesign = { ...design, dpi: Number(printDpi.value) || design.dpi };
    const offset = artworkOffsets(printDesign, printer.value,
      printOffsets(printDesign, feedOffset.valueAsNumber, sidewaysOffset.valueAsNumber));
    if (barcodeWouldClip(context, design, offset.sidewaysMm, offset.feedMm)) {
      warning = "The printer offsets push a barcode outside the label. Move it inward before printing.";
    }
    if (!warning && imageWouldClip(context, design, offset)) {
      warning = "An image will be cropped in print. Use Fit image to print area in Properties to keep it inside.";
    }
  }
  const dpi = invoke && printer.value ? Number(printDpi.value) || design.dpi : design.dpi;
  if (!warning && barcodeTooSmall(design, dpi)) warning = `Enlarge the QR Code or Data Matrix for ${dpi} dpi output.`;
  if (!warning && textBoxOverflows(context, design)) warning = "Text does not fit its text box at the minimum font size.";
  barcodeWarning.hidden = !warning;
  if (barcodeWarning.textContent !== warning) barcodeWarning.textContent = warning;
}

async function renderOutput(design, offset, validate = true) {
  const width = Math.round(design.width * design.dpi / millimetresPerInch);
  const height = Math.round(design.height * design.dpi / millimetresPerInch);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (validate && barcodeWouldClip(context, design)) {
    throw new Error("Move the whole barcode inside the label or use a larger label.");
  }
  if (validate && offset && barcodeWouldClip(context, design, offset.sidewaysMm, offset.feedMm)) {
    throw new Error("The printer offsets push a barcode outside the label. Move it inward before printing.");
  }
  if (validate && textBoxOverflows(context, design)) {
    throw new Error("Text does not fit its text box at the minimum font size.");
  }
  if (validate && barcodeTooSmall(design)) {
    throw new Error(`Enlarge the QR Code or Data Matrix for ${design.dpi} dpi output.`);
  }
  const exportImages = new Map(loadImages(design));
  await Promise.all(Array.from(exportImages.values(), image => image.decode()));
  drawLabel(context, design, width, height, exportImages);
  return canvas;
}

function sheetSettings(design) {
  const values = new FormData(sheetForm);
  const paper = paperSizes[values.get("paper")];
  const [left, top, gapX, gapY, copies] = ["left", "top", "gapX", "gapY", "copies"]
    .map(name => Number(values.get(name)));
  return { ...paper, positions: sheetLayout(design, paper, left, top, gapX, gapY, copies) };
}

function updateSheetFit() {
  const message = document.querySelector("#sheet-fit");
  const button = sheetForm.querySelector("button");
  try {
    if (!sheetForm.checkValidity()) throw new Error("Enter valid margins, gaps, and copy count.");
    const count = sheetSettings(currentDesign()).positions.length;
    message.textContent = `${count} per sheet at actual size.`;
    button.disabled = false;
  } catch (error) {
    message.textContent = error.message;
    button.disabled = true;
  }
}

sheetForm.oninput = updateSheetFit;
sheetForm.onsubmit = event => {
  event.preventDefault();
  exportPdf();
};

async function saveExport(filename, file) {
  if (invoke) {
    const bytes = await new Blob([filename, "\0", file]).arrayBuffer();
    return invoke("save_export", bytes);
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function compressPdfRaster(canvas, design, color = false) {
  const { width, height } = canvas;
  const { data } = color ? canvas.getContext("2d").getImageData(0, 0, width, height)
    : finishPrintRaster(canvas, design, { x: 0, y: 0 }, "driver");
  const pixels = new Uint8Array(width * height * (color ? 3 : 1));
  for (let channel = 0, offset = 0; channel < data.length; channel += 4) {
    if (color) {
      pixels[offset++] = data[channel];
      pixels[offset++] = data[channel + 1];
      pixels[offset++] = data[channel + 2];
    } else {
      pixels[offset++] = Math.round(0.2126 * data[channel] + 0.7152 * data[channel + 1] + 0.0722 * data[channel + 2]);
    }
  }
  const stream = new Blob([pixels]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function activeInkjetStock() {
  return inkjetStocks.find(stock => stock.id === label.sheetTemplate) ?? inkjetStocks[0];
}

function applyInkjetStock(stock) {
  Object.assign(label, { sheetTemplate: stock.id, width: stock.labelWidth, height: stock.labelHeight, cornerRadius: 0 });
}

function readInkjetUsage() {
  try {
    const usage = JSON.parse(localStorage.getItem(inkjetUsageKey));
    return usage && typeof usage === "object" && !Array.isArray(usage) ? usage : {};
  } catch {
    return {};
  }
}

function syncInkjetStock() {
  const active = activeInkjetStock();
  const matches = searchInkjetStocks(inkjet.search.value, readInkjetUsage());
  inkjet.template.replaceChildren(...matches.map(stock => new Option(`${stock.name} · ${stock.size}`, stock.id)));
  if (!matches.some(stock => stock.id === active.id)) {
    inkjet.template.prepend(new Option(matches.length ? "Select matching stock" : "No matching Avery stock", ""));
  }
  inkjet.template.value = matches.some(stock => stock.id === active.id) ? active.id : "";
  inkjet.template.disabled = !matches.length;
  inkjet["stock-summary"].textContent = `${active.name} · ${active.paper} · ${active.columns * active.rows} labels per sheet`;
}

inkjet.search.oninput = syncInkjetStock;
inkjet.template.onchange = () => {
  const stock = inkjetStocks.find(item => item.id === inkjet.template.value);
  if (stock && stock.id !== label.sheetTemplate) change(() => applyInkjetStock(stock));
};

function openInkjetSheet() {
  if (inkjet.dialog.open) return;
  finishInlineText(true);
  const stock = activeInkjetStock();
  const design = { ...structuredClone(currentDesign()), width: stock.labelWidth, height: stock.labelHeight, cornerRadius: 0 };
  const fields = numberedFields(design);
  inkjetJob = { stock, design, fields, positions: stockPositions(stock), selected: 0, used: new Set(),
    page: 0, images: new Map(), busy: false };
  const job = inkjetJob;
  inkjet["paper-details"].textContent = `${stock.name} · ${stock.paper} · ${job.positions.length} labels · ${stock.size}`;
  inkjet.field.replaceChildren(...fields.map((field, index) => {
    const name = field.text.slice(0, field.start) + "[" + field.digits + "]" + field.text.slice(field.start + field.digits.length);
    return new Option(`Text ${field.index + 1} · ${name}`, index);
  }));
  if (!fields.length) inkjet.field.add(new Option("No numbers found in label text", ""));
  inkjet.field.disabled = !fields.length;
  inkjet.start.value = fields[0]?.digits ?? "1";
  inkjet.step.value = "1";
  inkjet.quantity.value = job.positions.length;
  inkjet.modes.querySelector('[value="single"]').checked = true;
  inkjet["mark-used"].checked = false;
  inkjet.dialog.showModal();
  try {
    const usage = readInkjetUsage();
    const count = usage[stock.id];
    usage[stock.id] = Number.isSafeInteger(count) && count > 0 ? Math.min(count + 1, Number.MAX_SAFE_INTEGER) : 1;
    localStorage.setItem(inkjetUsageKey, JSON.stringify(usage));
  } catch {
    // Sheet printing still works when local storage is unavailable.
  }
  syncInkjetStock();
  loadImages(design, job.images, () => {
    if (inkjetJob === job && inkjet.dialog.open) updateInkjetPreview();
  });
  updateInkjetPreview();
}

function inkjetPlan() {
  const { design, fields, positions, used, selected } = inkjetJob;
  const mode = inkjet.modes.querySelector(":checked").value;
  if (mode !== "sequence") {
    return { pages: planInkjetSheets(positions, used, mode, selected, 1), designAt: () => design };
  }
  const field = fields[inkjet.field.selectedIndex];
  const start = inkjet.start.value.trim();
  const step = inkjet.step.value.trim();
  const quantity = inkjet.quantity.valueAsNumber;
  if (!field) throw new Error("Add a number to a text box on the label to use sequential numbering.");
  if (!/^\d{1,32}$/.test(start) || !/^\d{1,12}$/.test(step) || Number(step) < 1) {
    throw new Error("Enter a whole starting number and an increment of at least 1.");
  }
  if (!Number.isInteger(quantity) || !inkjet.quantity.validity.valid) {
    throw new Error(`Enter a quantity from 1 to ${inkjet.quantity.max}.`);
  }
  return {
    pages: planInkjetSheets(positions, used, mode, selected, quantity),
    designAt: index => numberedDesign(design, field, start, step, index)
  };
}

function positionInkjetLabel(node, stock, position, unit) {
  const relative = unit === "%";
  node.style.left = `${relative ? position.x / stock.width * 100 : position.x}${unit}`;
  node.style.top = `${relative ? position.y / stock.height * 100 : position.y}${unit}`;
  node.style.width = `${relative ? stock.labelWidth / stock.width * 100 : stock.labelWidth}${unit}`;
  node.style.height = `${relative ? stock.labelHeight / stock.height * 100 : stock.labelHeight}${unit}`;
}

function updateInkjetPreview(focusSlot) {
  const job = inkjetJob;
  const { stock, positions, used } = job;
  const mode = inkjet.modes.querySelector(":checked").value;
  inkjet.numbering.hidden = mode !== "sequence";
  let plan;
  let message = "";
  try {
    plan = inkjetPlan();
    if (!plan.pages.length) message = "Choose an available position to print.";
  } catch (error) {
    message = error.message;
  }
  const count = plan?.pages.length || 1;
  job.page = Math.min(job.page, count - 1);
  const bySlot = new Map(plan?.pages[job.page]?.map(position => [position.slot, position.raster]));
  const marking = inkjet["mark-used"].checked;
  inkjet["mark-option"].hidden = job.page !== 0;
  inkjet["position-help"].textContent = job.page !== 0 ? "Additional sheets use fresh stock."
    : marking ? "Select positions to mark them as used or available."
    : mode === "single" ? "Select where the label should print."
    : "Mark positions as used to skip them on the first sheet.";
  inkjet.page.style.aspectRatio = `${stock.width} / ${stock.height}`;
  const slots = positions.map((position, slot) => {
    const button = document.createElement("button");
    const isUsed = job.page === 0 && used.has(slot);
    const raster = bySlot.get(slot);
    button.type = "button";
    button.className = "inkjet-slot";
    button.disabled = job.busy || job.page !== 0 || (!marking && (mode !== "single" || isUsed));
    button.setAttribute("aria-label", `Position ${slot + 1}${isUsed ? ", used" : raster !== undefined ? ", prints" : ", blank"}`);
    button.dataset.state = isUsed ? "used" : raster !== undefined ? "print" : "blank";
    if (marking && job.page === 0) button.setAttribute("aria-pressed", String(isUsed));
    else if (mode === "single") button.setAttribute("aria-pressed", String(raster !== undefined));
    positionInkjetLabel(button, stock, position, "%");
    if (raster !== undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(stock.labelWidth * 4);
      canvas.height = Math.round(stock.labelHeight * 4);
      drawLabel(canvas.getContext("2d"), plan.designAt(raster), canvas.width, canvas.height, job.images);
      button.append(canvas);
    } else {
      button.textContent = isUsed ? "Used" : slot + 1;
    }
    button.onclick = () => {
      if (marking) {
        if (!used.delete(slot)) used.add(slot);
        if (used.has(job.selected)) job.selected = positions.findIndex((_, index) => !used.has(index));
        else if (job.selected < 0) job.selected = slot;
      } else job.selected = slot;
      updateInkjetPreview(slot);
    };
    return button;
  });
  inkjet.page.replaceChildren(...slots);
  if (focusSlot !== undefined) slots[focusSlot]?.focus();
  inkjet.prev.disabled = job.busy || job.page === 0;
  inkjet.next.disabled = job.busy || job.page >= count - 1;
  inkjet["page-count"].textContent = `Sheet ${job.page + 1} of ${count}`;
  inkjet.export.disabled = inkjet.print.disabled = job.busy || Boolean(message);
  inkjet.dialog.querySelector('form[method="dialog"] button').disabled = job.busy;
  inkjet.status.textContent = job.busy ? "Preparing sheets…" : message;
}

inkjet.open.onclick = openInkjetSheet;
inkjet.dialog.oncancel = event => { if (inkjetJob.busy) event.preventDefault(); };
inkjet.modes.onchange = () => { inkjetJob.page = 0; updateInkjetPreview(); };
inkjet.field.onchange = () => {
  inkjet.start.value = inkjetJob.fields[inkjet.field.selectedIndex].digits;
  updateInkjetPreview();
};
for (const name of ["start", "step", "quantity", "mark-used"]) inkjet[name].oninput = () => updateInkjetPreview();
inkjet.prev.onclick = () => { inkjetJob.page--; updateInkjetPreview(); };
inkjet.next.onclick = () => { inkjetJob.page++; updateInkjetPreview(); };

async function outputInkjetSheet(print) {
  const job = inkjetJob;
  if (job.busy) return;
  const images = [];
  let status = "";
  try {
    const { pages, designAt } = inkjetPlan();
    if (!pages.length) return;
    job.busy = true;
    updateInkjetPreview();
    const { stock } = job;
    const rasters = [];
    let width, height;
    const rasterCount = Math.max(...pages.flat().map(position => position.raster)) + 1;
    for (let index = 0; index < rasterCount; index++) {
      const design = designAt(index);
      const canvas = await renderOutput(design);
      ({ width, height } = canvas);
      if (print) images.push(URL.createObjectURL(await canvas.convertToBlob()));
      else rasters.push(await compressPdfRaster(canvas, design, true));
    }
    if (print) await printInkjetPages(stock, pages, images);
    else {
      const pdf = makeSheetPdf(rasters, width, height, stock.labelWidth, stock.labelHeight, { ...stock, pages, color: true });
      const saved = await saveExport(`Avery-${stock.id}-sheet.pdf`, pdf);
      status = saved ? "Sheet PDF exported." : "PDF export cancelled.";
    }
  } catch (error) {
    status = error.message ?? String(error);
  } finally {
    images.forEach(url => URL.revokeObjectURL(url));
    job.busy = false;
    if (job === inkjetJob && inkjet.dialog.open) {
      updateInkjetPreview();
      if (status) inkjet.status.textContent = status;
    }
  }
}

async function printInkjetPages(stock, pages, urls) {
  const container = inkjet["print-pages"];
  const sections = pages.map(positions => {
    const section = document.createElement("section");
    section.style.width = `${stock.width}mm`;
    section.style.height = `${stock.height}mm`;
    for (const position of positions) {
      const img = new Image();
      img.src = urls[position.raster];
      positionInkjetLabel(img, stock, position, "mm");
      section.append(img);
    }
    return section;
  });
  try {
    container.replaceChildren(...sections);
    await Promise.all([...container.querySelectorAll("img")].map(img => img.decode()));
    document.body.classList.add("printing-inkjet");
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("beforeprint", started);
        window.removeEventListener("afterprint", finished);
      };
      const started = () => clearTimeout(timer);
      const finished = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("The print dialog did not open. Export the PDF and print it at Actual size."));
      }, 2000);
      window.addEventListener("beforeprint", started, { once: true });
      window.addEventListener("afterprint", finished, { once: true });
      try { window.print(); }
      catch (error) { cleanup(); reject(error); }
    });
  } finally {
    document.body.classList.remove("printing-inkjet");
    container.replaceChildren();
  }
}

inkjet.export.onclick = () => outputInkjetSheet(false);
inkjet.print.onclick = () => outputInkjetSheet(true);

async function exportPdf() {
  if (label.media === "inkjet") return openInkjetSheet();
  if (controls.export.disabled) return;
  finishInlineText(true);
  controls.export.disabled = true;
  try {
    const design = structuredClone(currentDesign());
    if (design.media === "sheet" && !sheetForm.reportValidity()) return;
    const sheet = design.media === "sheet" ? sheetSettings(design) : undefined;
    const canvas = await renderOutput(design);
    const compressed = await compressPdfRaster(canvas, design);
    const pdf = makePdf(compressed, canvas.width, canvas.height, design.width, design.height, sheet);
    const saved = await saveExport(sheet ? "label-sheet.pdf" : "label.pdf", pdf);
    controls.status.textContent = saved ? "PDF exported." : "PDF export cancelled.";
  } catch (error) {
    controls.status.textContent = `PDF export failed. ${error.message ?? error}`;
  } finally {
    controls.export.disabled = false;
  }
}

controls.export.onclick = exportPdf;
const nativeInvoke = window.__TAURI__?.core.invoke;
const platform = nativeInvoke ? await nativeInvoke("desktop_platform") : "web";
const invoke = platform === "windows" ? nativeInvoke : undefined;
if (platform === "linux") {
  const shortcuts = document.querySelector("#linux-shortcuts-dialog");
  const openShortcuts = document.querySelector("#linux-shortcuts-open");
  const shortcutStatus = document.querySelector("#linux-shortcuts-status");
  const pinDock = document.querySelector("#linux-pin-dock");
  document.querySelector("#linux-print-note").hidden = false;
  openShortcuts.hidden = false;
  openShortcuts.onclick = async () => {
    shortcuts.showModal();
    pinDock.hidden = !await nativeInvoke("desktop_can_pin").catch(() => false);
  };
  for (const [button, command] of [[document.querySelector("#linux-desktop-shortcut"), "create_desktop_shortcut"],
    [pinDock, "pin_to_gnome_dock"]]) {
    button.onclick = async () => {
      try {
        shortcutStatus.textContent = await nativeInvoke(command);
      } catch (error) {
        shortcutStatus.textContent = error.message ?? String(error);
      }
    };
  }
}
const creditsDialog = document.querySelector("#credits-dialog");
const aboutDialog = document.querySelector("#about-dialog");
const helpMenu = document.querySelector("#help-menu");
document.querySelector("#about-file-version").textContent = `Version ${designFileVersion}`;
document.querySelector("#open-about").onclick = async () => {
  const version = document.querySelector("#about-version");
  aboutDialog.showModal();
  helpMenu.open = false;
  try {
    const response = await fetch("./app-info.json");
    if (!response.ok) throw new Error("Version metadata unavailable");
    const appInfo = await response.json();
    version.textContent = appInfo.version ?? "Unavailable";
  } catch {
    version.textContent = "Unavailable";
  }
};
document.querySelector("#open-source-credits").onclick = () => {
  document.querySelector("#credits-status").textContent = "";
  creditsDialog.showModal();
  helpMenu.open = false;
};
helpMenu.querySelectorAll("a[data-project]").forEach(link => {
  link.addEventListener("click", async event => {
    if (!invoke) return;
    event.preventDefault();
    try {
      await invoke("open_project_documentation", { project: link.dataset.project });
      helpMenu.open = false;
    } catch (error) {
      controls.status.textContent = String(error);
    }
  });
});
if (invoke) {
  creditsDialog.addEventListener("click", async event => {
    const link = event.target.closest("a[data-project]");
    if (!link) return;
    event.preventDefault();
    try {
      await invoke("open_project_documentation", { project: link.dataset.project });
    } catch (error) {
      document.querySelector("#credits-status").textContent = String(error);
    }
  });
}
controls.print.hidden = !invoke;
const printer = document.querySelector("#printer");
const copies = document.querySelector("#print-copies");
const printTarget = document.querySelector("#print-target");
const barcodeWarning = document.querySelector("#barcode-warning");
const printActivity = document.querySelector("#print-activity");
const queueStatus = document.querySelector("#print-queue-status");
const reprint = document.querySelector("#reprint");
const reprintTarget = document.querySelector("#reprint-target");
const refreshPrintStatus = document.querySelector("#refresh-print-status");
const cancelPrintJob = document.querySelector("#cancel-print-job");
const historyDialog = document.querySelector("#history-dialog");
const historyStatus = document.querySelector("#history-status");
const historyJobs = document.querySelector("#history-jobs");
const printDpi = document.querySelector("#print-dpi");
const toneControl = document.querySelector("#print-tone");
const printSetup = document.querySelector("#print-setup");
const printerSettings = document.querySelector("#printer-settings");
const stockGap = document.querySelector("#stock-gap");
const compatibleStock = document.querySelector("#compatible-stock");
const stockCompatibility = document.querySelector("#stock-compatibility");
const feedOffset = document.querySelector("#feed-offset");
const sidewaysOffset = document.querySelector("#sideways-offset");
const printCalibration = document.querySelector("#print-calibration");
const calibrationInset = document.querySelector("#calibration-inset");
const calibrationGuide = document.querySelector("#calibration-guide");
const calibrationUp = document.querySelector("#calibration-up");
const calibrationDown = document.querySelector("#calibration-down");
const calibrationLeft = document.querySelector("#calibration-left");
const calibrationRight = document.querySelector("#calibration-right");
const calibrationKeep = document.querySelector("#calibration-keep");
const calibrationGuideStatus = document.querySelector("#calibration-guide-status");
const calibrationForm = document.querySelector("#calibration-measurements");
const calibrationStatus = document.querySelector("#calibration-status");
const offsetControls = [feedOffset, sidewaysOffset];
function stockDimensions(design) {
  const dimensions = [design.width, design.height];
  if (design.media === "continuous") dimensions.push("continuous");
  return dimensions;
}
const stockKey = () => JSON.stringify([printer.value, ...stockDimensions(label)]);
const profileKey = () => `labelit-stock-offsets:${stockKey()}`;
let loadedStock;
let calibrationSample;
let lastLabelJob;
let queueJob;
let queueCheck;
let queueTimer;

function updateStockFilter() {
  const website = document.querySelector("#stock-website").value;
  const zebra = /\bZD410\b/i.test(printer.value);
  document.querySelector("#zebra-smartcal").hidden = !zebra;
  document.querySelector("#general-media-calibration").hidden = zebra;
  const brother = /\bBrother\b.*\bQL[- ](?:560|600|700|800)\b/i.test(printer.value);
  const profile = thermalPrinterProfile(printer.value);
  const maxWidth = /\b300\s*dpi\b/i.test(printer.value) ? 54 : 56;
  const known = zebra || brother || Boolean(profile);
  compatibleStock.disabled = !known;
  const filter = compatibleStock.checked && known;
  for (const group of controls.preset.querySelectorAll("optgroup")) {
    for (const option of group.children) {
      const [width, length] = option.value.split(",").map(Number);
      const dk = option.dataset.media === "brother-dk";
      const b1Stock = option.dataset.media === "niimbot-b1";
      const fits = brother ? dk
        : profile ? !dk && (!b1Stock || profile.niimbot)
          && width >= profile.width[0] && width <= profile.width[1]
          && (!profile.length || (length >= profile.length[0] && length <= profile.length[1]))
        : !dk && !b1Stock && width >= 15 && width <= maxWidth && length >= 6.35;
      option.hidden = filter && !fits;
    }
    group.hidden = Boolean(website && group.dataset.website !== website)
      || Array.from(group.children).every(option => option.hidden);
  }
  stockCompatibility.hidden = !printer.value || (known && !filter);
  stockCompatibility.textContent = !known
    ? "No stock profile for this printer. Showing all sizes for the chosen website."
    : brother ? "Showing Brother DK rolls listed for this printer."
    : profile ? `${profile.name} · ${profile.width.join("–")} mm stock width${profile.printWidth ? ` · ${profile.printWidth} mm printable width` : ""}. Check roll and liner fit.`
    : `Showing stock up to ${maxWidth} mm wide for full-width printing. Check that the roll and liner fit your printer.`;
}
compatibleStock.onchange = updateStockFilter;

function refreshPrintSetups() {
  const prefix = "labelit-stock-offsets:";
  const installedPrinters = new Set(Array.from(printer.options, option => option.value));
  const setups = Object.keys(localStorage).flatMap(key => {
    if (!key.startsWith(prefix)) return [];
    try {
      const [name, width, height, media] = JSON.parse(key.slice(prefix.length));
      if (!installedPrinters.has(name) || !name || !Number.isFinite(width) || !Number.isFinite(height)
          || width < 5 || width > 220 || height < 5 || height > 300) return [];
      const stock = Array.from(controls.preset.options).find(option => option.value === `${width},${height}`);
      const stockName = stock?.textContent ?? `${width} × ${height} mm`;
      return [new Option(`${media === "continuous" ? `Continuous · ${width} × ${height} mm` : stockName} · ${name}`, key)];
    } catch {
      return [];
    }
  });
  setups.sort((a, b) => a.textContent.localeCompare(b.textContent));
  printSetup.replaceChildren(new Option("Choose a setup", ""), ...setups);
  printSetup.value = setups.some(option => option.value === profileKey()) ? profileKey() : "";
  document.querySelector("#print-setup-field").hidden = setups.length === 0;
}

function updatePrintTarget() {
  if (label.media === "inkjet") {
    controls.print.disabled = false;
    printTarget.textContent = `${activeInkjetStock().name} · ${activeInkjetStock().paper}`;
    return;
  }
  const stock = controls.preset.value === "custom"
    ? `${label.width} × ${label.height} mm`
    : controls.preset.selectedOptions[0].textContent;
  const count = copies.valueAsNumber;
  document.querySelector("#printer-settings-target").textContent = printer.value
    ? `${printer.value} · ${label.width} × ${label.height} mm` : "Select a printer";
  printTarget.textContent = printer.value && copies.validity.valid
    ? `${printer.value} · ${stock} · ${count === 1 ? "1 copy" : `${count} copies`}`
    : "";
}

async function checkQueue(job, remaining = 0) {
  if (!job || job !== queueJob || queueCheck === job) return;
  clearTimeout(queueTimer);
  queueCheck = job;
  refreshPrintStatus.disabled = true;
  try {
    const status = await invoke("print_job_status", { printerName: job.printer, jobId: job.id });
    if (job !== queueJob) return;
    if (cancelPrintJob.disabled) return;
    queueStatus.textContent = `Job ${job.id} · ${status}`;
    const finished = ["No longer in the Windows queue", "Cancelled or removed", "Windows reports printed"].includes(status);
    cancelPrintJob.hidden = finished;
    if (remaining > 0 && !finished) {
      queueTimer = setTimeout(() => checkQueue(job, remaining - 1), 3000);
    }
  } catch (error) {
    if (job === queueJob) queueStatus.textContent = `Job ${job.id} · ${error.message ?? error}`;
  } finally {
    if (queueCheck === job) queueCheck = undefined;
    if (job === queueJob) refreshPrintStatus.disabled = false;
  }
}

async function submitPrintJob(job) {
  const id = await invoke(job.zebra ? "print_zebra_label" : "print_label", job.bytes);
  trackPrintJob(id, job.printer);
  if (job.title) void rememberJob({ ...job, id }).catch(() => {});
}

document.querySelector("#history-open").onclick = async () => {
  historyStatus.textContent = "Loading jobs…";
  historyJobs.replaceChildren();
  historyDialog.showModal();
  try {
    const entries = await historyEntries();
    historyStatus.textContent = entries.length ? "" : "No recent print jobs.";
    for (const job of entries) {
      const item = document.createElement("div");
      item.className = "history-job";
      const title = document.createElement("strong");
      title.textContent = job.title;
      const summary = document.createElement("p");
      summary.className = "setting-note";
      summary.textContent = `${job.summary} · ${new Date(job.time).toLocaleString()}`;
      item.append(title, summary);
      if (job.bytes || job.batch) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Reprint this job";
        button.onclick = async () => {
          if (controls.print.disabled) return;
          setPrintBusy(true);
          try {
            if (job.batch) {
              const { settings, rasters } = job.batch;
              const pageBytes = settings.width * settings.height * 4;
              const id = await spoolCsvBatch(settings, async (page, destination) => {
                const slice = rasters.slice(page * pageBytes, (page + 1) * pageBytes);
                destination.set(new Uint8Array(await slice.arrayBuffer()));
              }, message => { historyStatus.textContent = message; });
              void rememberJob({ ...job, id }).catch(() => {});
            } else {
              await submitPrintJob(job);
            }
            historyStatus.textContent = "Reprint submitted to Windows.";
          } catch (error) {
            historyStatus.textContent = `Reprint failed. ${error.message ?? error}`;
          } finally {
            setPrintBusy(false);
          }
        };
        item.append(button);
      }
      historyJobs.append(item);
    }
  } catch {
    historyStatus.textContent = "Print history could not be opened.";
  }
};
document.querySelector("#history-close").onclick = () => historyDialog.close();

function trackPrintJob(id, printerName) {
  if (Number.isInteger(id) && id > 0) {
    queueJob = { id, printer: printerName };
    cancelPrintJob.hidden = false;
    cancelPrintJob.disabled = false;
    cancelPrintJob.textContent = "Cancel job";
    printActivity.hidden = false;
    printActivity.open = true;
    queueStatus.textContent = `Job ${id} · Submitted to Windows`;
    void checkQueue(queueJob, 10);
  }
}

function setPrintBusy(busy) {
  controls.print.disabled = busy;
  printCalibration.disabled = busy;
  reprint.disabled = busy;
}

refreshPrintStatus.onclick = () => checkQueue(queueJob);
cancelPrintJob.onclick = async () => {
  const job = queueJob;
  if (!job) return;
  if (cancelPrintJob.textContent === "Cancel job") {
    cancelPrintJob.textContent = "Confirm cancel";
    return;
  }
  clearTimeout(queueTimer);
  cancelPrintJob.disabled = true;
  try {
    await invoke("cancel_print_job", { printerName: job.printer, jobId: job.id });
    if (queueJob !== job) return;
    cancelPrintJob.hidden = true;
    queueStatus.textContent = `Job ${job.id} · Windows accepted cancellation`;
  } catch (error) {
    if (queueJob !== job) return;
    queueStatus.textContent = `Job ${job.id} · ${error.message ?? error}`;
  } finally {
    if (queueJob === job) {
      cancelPrintJob.textContent = "Cancel job";
      cancelPrintJob.disabled = false;
    }
  }
};
function readStockProfile(name, design) {
  const key = JSON.stringify([name, ...stockDimensions(design)]);
  const profile = JSON.parse(localStorage.getItem(`labelit-stock-offsets:${key}`) ?? "{}") ?? {};
  const preset = Array.from(controls.preset.options).find(option => option.value === `${design.width},${design.height}`);
  const printerProfile = thermalPrinterProfile(name);
  const settings = { dpi: profile.dpi ?? (printerProfile ? String(printerProfile.dpi) : preset?.dataset.printDpi ?? ""),
    tone: ["auto", "thermal", "driver"].includes(profile.tone) ? profile.tone : "auto", radius: profile.radius };
  for (const input of offsetControls) {
    const previous = design.media !== "continuous" && design.width === 50 && design.height === 30 && name.startsWith("ZDesigner ZD410-")
      ? localStorage.getItem(`labelit-${input.id}:${name}`)
      : null;
    settings[input.id] = profile[input.id] ?? previous ?? "0";
  }
  // Earlier versions saved zero for this stock before its print origin was
  // measured. Restore the verified feed correction for those older profiles.
  const output = { ...design, dpi: Number(settings.dpi) || design.dpi };
  if (!profile.feedOffsetConfirmed && Number(settings["feed-offset"]) === 0
    && usesFullSizeZebra(output, name, printTone(settings.tone, name))) {
    settings["feed-offset"] = "3.6";
  }
  return settings;
}

const loadOffsets = () => {
  if (loadedStock === stockKey()) return;
  loadedStock = stockKey();
  calibrationSample = undefined;
  calibrationGuide.hidden = true;
  printCalibration.textContent = "Print calibration label";
  try {
    const profile = readStockProfile(printer.value, label);
    printDpi.value = profile.dpi;
    toneControl.value = profile.tone;
    for (const input of offsetControls) input.value = profile[input.id];
  } catch {
    printDpi.value = controls.preset.selectedOptions[0].dataset.printDpi ?? "";
    toneControl.value = "auto";
    for (const input of offsetControls) input.value = "0";
    controls.status.textContent = "Could not read this stock profile.";
  }
  refreshPrintSetups();
};

function saveOffsets() {
  const profile = Object.fromEntries(offsetControls.map(input => [input.id, input.value]));
  profile.dpi = printDpi.value;
  profile.tone = toneControl.value;
  profile.feedOffsetConfirmed = true;
  profile.radius = cornerRadius(label);
  try {
    localStorage.setItem(profileKey(), JSON.stringify(profile));
    refreshPrintSetups();
    return true;
  } catch {
    controls.status.textContent = "Could not save this stock profile.";
    return false;
  }
}
document.querySelector("#print-setup-save").onclick = () => {
  if (!printer.value) {
    printerSettings.open = true;
    printer.focus();
    return;
  }
  if (offsetControls.every(input => input.reportValidity()) && saveOffsets()) {
    controls.status.textContent = "Printer and stock setup saved.";
  }
};
printSetup.onchange = () => {
  if (!printSetup.value) return;
  const [name, width, height, media = "label"] = JSON.parse(printSetup.value.slice("labelit-stock-offsets:".length));
  const radius = readStockProfile(name, { width, height, media }).radius;
  printer.value = name;
  if (label.width !== width || label.height !== height || (label.media ?? "label") !== media
      || Number.isFinite(radius) && radius !== cornerRadius(label)) {
    change(() => {
      Object.assign(label, { width, height, media });
      if (Number.isFinite(radius)) label.cornerRadius = cornerRadius({ width, height, cornerRadius: radius });
    });
  }
  printer.onchange();
};
const printerWelcome = document.querySelector("#printer-welcome");
const welcomeList = document.querySelector("#welcome-printer-list");
const welcomeForm = document.querySelector("#printer-welcome-form");
const welcomeUse = document.querySelector("#welcome-use-printer");
const welcomeStatus = document.querySelector("#welcome-printer-status");
const welcomeRefresh = document.querySelector("#welcome-refresh");
const driverGuide = document.querySelector("#open-driver-guide");
const driverModel = document.querySelector("#open-driver-model");
const driverStatus = document.querySelector("#open-driver-status");
const driverNotes = {
  niimgo: "niimgo is a standalone print tool. Its maintainers tested the B1 over USB on Linux. It does not create a Windows printer queue.",
  niimprintx: "NiimPrintX is a separate print app that lists B21 support over USB and Bluetooth. Label-IT does not send jobs to it yet.",
  lprint: "LPrint can expose Zebra ZPL and EPL2 printers as IPP printers. Check the project’s setup instructions for your system.",
  "phomemo-tools": "phomemo-tools lists the M110 and M220 in its Linux CUPS driver. Check your model and Linux distribution before setup.",
  phomymo: "Phomymo lists USB support for the PM-241BT in a compatible browser. It runs as a separate print app.",
  openprinting: "Check whether the printer supports IPP Everywhere or has an OpenPrinting Printer Application.",
};
const listPrinterNames = () => Array.from(printer.options, option => option.value).filter(Boolean);

function updateDriverGuide() {
  document.querySelector("#open-driver-note").textContent = driverNotes[driverModel.value];
  driverStatus.textContent = "";
}

function suggestDriverProject(queueName) {
  const model = thermalPrinterProfile(queueName)?.name;
  switch (model) {
    case "NIIMBOT B1": return "niimgo";
    case "NIIMBOT B21": return "niimprintx";
    case "Phomemo M110":
    case "Phomemo M220": return "phomemo-tools";
    case "Phomemo PM-241BT": return "phomymo";
    default: return /\bzebra\b|\bzdesigner\b/i.test(queueName) ? "lprint" : "openprinting";
  }
}

function renderPrinterChoices() {
  const selected = welcomeList.querySelector(":checked")?.value || printer.value;
  const names = listPrinterNames();
  welcomeList.replaceChildren(...names.map(name => {
    const row = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "welcome-printer";
    radio.value = name;
    radio.checked = name === selected;
    const check = document.createElement("span");
    check.className = "welcome-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    row.append(radio, check, name);
    return row;
  }));
  welcomeUse.disabled = !names.includes(selected);
  welcomeStatus.textContent = names.length ? "" : "Windows has no installed printers yet.";
}

async function refreshPrinters() {
  const names = await invoke("list_printers");
  const selected = printer.value || localStorage.getItem("labelit-printer");
  printer.replaceChildren(new Option("Select a printer", ""), ...names.map(name => new Option(name, name)));
  printer.value = names.includes(selected) ? selected : "";
  updateStockFilter();
  loadOffsets();
  refreshPrintSetups();
  updatePrintTarget();
  schedulePreview();
  controls.print.disabled = names.length === 0;
  printCalibration.disabled = names.length === 0;
  return names;
}

function openPrinterPicker(addPrinter) {
  welcomeList.replaceChildren();
  renderPrinterChoices();
  document.querySelector("#printer-welcome-title").textContent = addPrinter ? "Add label printer" : "Welcome to Label-IT";
  document.querySelector("#welcome-add").open = addPrinter || !listPrinterNames().length;
  driverGuide.open = addPrinter && !listPrinterNames().length;
  driverModel.value = suggestDriverProject(printer.value);
  updateDriverGuide();
  if (!printerWelcome.open) printerWelcome.showModal();
}

function finishPrinterSetup() {
  localStorage.setItem("labelit-printer-setup-seen", "1");
  printerWelcome.close();
}

let printersReady;
if (invoke) {
  document.querySelector("#print-options").hidden = false;
  document.querySelector("#print-copies-field").hidden = false;
  document.querySelector("#stock-filter-field").hidden = false;
  updateStockFilter();
  controls.print.disabled = true;
  printer.onchange = () => {
    localStorage.setItem("labelit-printer", printer.value);
    updateStockFilter();
    loadOffsets();
    updatePrintTarget();
    schedulePreview();
  };
  welcomeList.onchange = () => {
    const selected = welcomeList.querySelector(":checked");
    welcomeUse.disabled = !selected;
    driverModel.value = suggestDriverProject(selected?.value ?? "");
    updateDriverGuide();
  };
  driverModel.onchange = updateDriverGuide;
  document.querySelector("#open-driver-project").onclick = async () => {
    try {
      await invoke("open_project_documentation", { project: driverModel.value });
    } catch (error) {
      driverStatus.textContent = String(error);
    }
  };
  welcomeForm.onsubmit = event => {
    event.preventDefault();
    const selected = welcomeList.querySelector(":checked")?.value;
    if (!listPrinterNames().includes(selected)) return;
    printer.value = selected;
    printer.onchange();
    finishPrinterSetup();
  };
  document.querySelector("#welcome-later").onclick = finishPrinterSetup;
  printerWelcome.oncancel = event => {
    event.preventDefault();
    finishPrinterSetup();
  };
  welcomeRefresh.onclick = async () => {
    welcomeRefresh.disabled = true;
    welcomeStatus.textContent = "Checking for printers…";
    try {
      await refreshPrinters();
      if (printerWelcome.open) renderPrinterChoices();
    } catch (error) {
      welcomeStatus.textContent = `Could not refresh the printer list. ${error}`;
    } finally {
      welcomeRefresh.disabled = false;
    }
  };
  for (const [id, bluetooth] of [["welcome-bluetooth", true], ["welcome-windows-printers", false]]) {
    document.querySelector(`#${id}`).onclick = async () => {
      try {
        await invoke("open_device_settings", { bluetooth });
        welcomeStatus.textContent = "Return to Label-IT and refresh the list after setup.";
      } catch (error) {
        welcomeStatus.textContent = String(error);
      }
    };
  }
  document.querySelector("#add-label-printer").onclick = () => openPrinterPicker(true);
  printersReady = refreshPrinters().catch(error => {
    controls.status.textContent = `Could not load printers. ${error}`;
  }).then(() => {
    if (!printerWelcome.open && !printer.value && !localStorage.getItem("labelit-printer-setup-seen")) {
      openPrinterPicker(false);
    }
  });
  copies.oninput = updatePrintTarget;
  for (const input of [...offsetControls, printDpi, toneControl]) {
    input.oninput = () => {
      schedulePreview();
      if (calibrationSample) updateCalibrationGuide();
    };
    input.onchange = () => {
      if (printer.value && offsetControls.every(control => control.validity.valid)) saveOffsets();
    };
  }
}

function renderCalibration(design, requestedInset) {
  const width = Math.round(design.width * design.dpi / millimetresPerInch);
  const height = Math.round(design.height * design.dpi / millimetresPerInch);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  drawLabel(context, { ...design, elements: [] }, width, height);
  const cornerInset = cornerRadius(design) * (1 - Math.SQRT1_2) + 0.125;
  const inset = Math.min(Math.min(design.width, design.height) / 3, Math.max(requestedInset, cornerInset));
  const frameWidth = design.width - 2 * inset;
  const frameHeight = design.height - 2 * inset;
  context.strokeStyle = "#000";
  context.lineWidth = 0.25;
  context.strokeRect(inset, inset, frameWidth, frameHeight);
  context.font = `${Math.min(2.5, frameHeight / 3)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText("TOP", design.width / 2, inset + 0.4, frameWidth);
  return canvas;
}

function updateCalibrationGuide() {
  const { design, feedMm, sidewaysMm, inset } = calibrationSample;
  const note = document.querySelector("#calibration-preview-note");
  if (!offsetControls.every(input => input.validity.valid)) {
    for (const button of [calibrationUp, calibrationDown, calibrationLeft, calibrationRight, calibrationKeep]) {
      button.disabled = true;
    }
    note.textContent = "Enter valid offsets to update the preview.";
    return;
  }
  const calibrationFeed = feedOffset.valueAsNumber;
  const calibrationSideways = sidewaysOffset.valueAsNumber;
  const previous = printOffsets(design, feedMm, sidewaysMm);
  const next = printOffsets(design, calibrationFeed, calibrationSideways);
  const feedChange = calibrationFeed - feedMm;
  const sideChange = calibrationSideways - sidewaysMm;
  const movements = [
    feedChange && `${Math.abs(feedChange).toFixed(1)} mm ${feedChange < 0 ? "up" : "down"}`,
    sideChange && `${Number(Math.abs(sideChange).toFixed(2))} mm ${sideChange < 0 ? "left" : "right"}`,
  ].filter(Boolean);
  const lastRaster = renderCalibration(design, inset);
  const nextInset = Number(calibrationInset.value);
  const nextRaster = nextInset === inset ? lastRaster : renderCalibration(design, nextInset);
  paintPrintPreview(document.querySelector("#calibration-last"),
    finishPrintRaster(lastRaster, design, { x: 0, y: 0 }, "driver"), design);
  paintPrintPreview(document.querySelector("#calibration-next"),
    finishPrintRaster(nextRaster, design, { x: next.x - previous.x, y: next.y - previous.y }, "driver"), design);
  note.textContent = movements.length
    ? `${movements.join(" and ")} from your last print.${next.x === previous.x && next.y === previous.y ? " Same printer dots at this resolution." : ""}`
    : `Feed ${calibrationFeed.toFixed(1)} mm · Sideways ${calibrationSideways.toFixed(2)} mm`;
  calibrationUp.disabled = calibrationFeed <= -10;
  calibrationDown.disabled = calibrationFeed >= 10;
  calibrationLeft.disabled = calibrationSideways <= -10;
  calibrationRight.disabled = calibrationSideways >= 10;
  calibrationKeep.disabled = calibrationFeed !== feedMm || calibrationSideways !== sidewaysMm;
}

calibrationInset.onchange = () => {
  if (calibrationSample) updateCalibrationGuide();
};

for (const [button, step, input, precision] of [
  [calibrationUp, -0.1, feedOffset, 1], [calibrationDown, 0.1, feedOffset, 1],
  [calibrationLeft, -0.1, sidewaysOffset, 2], [calibrationRight, 0.1, sidewaysOffset, 2],
]) {
  button.onclick = () => {
    const next = Math.min(Number(input.max), Math.max(Number(input.min), input.valueAsNumber + step));
    input.value = next.toFixed(precision);
    schedulePreview();
    updateCalibrationGuide();
    calibrationGuideStatus.textContent = calibrationKeep.disabled ? "Print another test to check this adjustment." : "";
  };
}

calibrationKeep.onclick = () => {
  const saved = saveOffsets();
  schedulePreview();
  calibrationGuideStatus.textContent = saved
    ? "Saved both offsets for this printer and label size." : "Could not save this stock profile.";
};

function printBytes(frame, design, printerName, count, deviceOffset) {
  const { width, height } = frame;
  const prefix = deviceOffset ? 8 : 0;
  const pixelOffset = prefix + 24 + printerName.length;
  const job = new Uint8Array(pixelOffset + width * height * 4);
  if (deviceOffset) {
    const calibration = new DataView(job.buffer, 0, prefix);
    calibration.setInt32(0, deviceOffset.y, true);
    calibration.setInt32(4, deviceOffset.x, true);
  }
  const header = new DataView(job.buffer, prefix);
  header.setInt32(0, width, true);
  header.setInt32(4, height, true);
  header.setInt32(8, Math.round(design.width * 10), true);
  header.setInt32(12, Math.round(design.height * 10), true);
  header.setInt32(16, count, true);
  header.setInt32(20, printerName.length, true);
  job.set(printerName, prefix + 24);
  writePrintPixels(frame, job.subarray(pixelOffset));
  return job;
}

function writePrintPixels({ data }, destination) {
  for (let i = 0; i < data.length; i += 4) {
    destination[i] = data[i + 2];
    destination[i + 1] = data[i + 1];
    destination[i + 2] = data[i];
  }
}

function paintPrintPreview(canvas, frame, design) {
  canvas.width = frame.width;
  canvas.height = frame.height;
  const radius = cornerRadius(design);
  canvas.style.borderRadius = `${100 * radius / design.width}% / ${100 * radius / design.height}%`;
  canvas.getContext("2d").putImageData(frame, 0, 0);
}

async function printLabel(calibration = false) {
  if (label.media === "inkjet") {
    if (!calibration) openInkjetSheet();
    return;
  }
  if (label.media === "sheet") {
    if (!calibration) return exportPdf();
    controls.status.textContent = "Export a sheet PDF and print at Actual size to check alignment.";
    return;
  }
  if (!invoke || controls.print.disabled) return;
  if (!printer.value) {
    controls.status.textContent = "Select a printer in Label setup.";
    printerSettings.open = true;
    printer.focus();
    return;
  }
  if (!calibration && !copies.reportValidity()) return;
  if (!offsetControls.every(input => input.validity.valid)) {
    printerSettings.open = true;
    offsetControls.find(input => !input.validity.valid).reportValidity();
    return;
  }
  finishInlineText(true);
  setPrintBusy(true);
  try {
    const key = stockKey();
    const title = calibration ? undefined : library.designs[library.active].name;
    const targetPrinter = printer.value;
    const targetSummary = printTarget.textContent;
    const printerName = new TextEncoder().encode(targetPrinter);
    const count = calibration ? 1 : copies.valueAsNumber;
    const feedMm = feedOffset.valueAsNumber;
    const sidewaysMm = sidewaysOffset.valueAsNumber;
    const design = structuredClone(currentDesign());
    if (printDpi.value) design.dpi = Number(printDpi.value);
    const offset = printOffsets(design, feedMm, sidewaysMm);
    const tone = printTone(toneControl.value, targetPrinter);
    const zebra = usesFullSizeZebra(design, targetPrinter, tone);
    const rasterOffset = zebra ? printOffsets(design, 0, 0) : offset;
    const inset = Number(calibrationInset.value);
    const canvas = calibration ? renderCalibration(design, inset) : await renderOutput(design, rasterOffset);
    const frame = finishPrintRaster(canvas, design, rasterOffset, tone);
    const job = printBytes(frame, design, printerName, count, zebra ? offset : undefined);
    controls.status.textContent = "";
    const submission = { bytes: job, printer: targetPrinter, count, summary: targetSummary, title, zebra };
    await submitPrintJob(submission);
    if (!calibration) {
      lastLabelJob = submission;
      reprintTarget.textContent = targetSummary;
      reprint.hidden = false;
    }
    if (calibration && key === stockKey()) {
      calibrationSample = { feedMm, sidewaysMm, design, inset };
      calibrationForm.reset();
      calibrationStatus.textContent = "";
      calibrationGuideStatus.textContent = "Calibration label sent. Check it with TOP upright.";
      calibrationGuide.hidden = false;
      printCalibration.textContent = "Print another test";
      updateCalibrationGuide();
    }
    controls.status.textContent = count === 1 ? "One label sent to the printer." : `${count} labels sent to the printer.`;
  } catch (error) {
    controls.status.textContent = "Printing failed. " + (error.message ?? error);
  } finally {
    setPrintBusy(false);
  }
}

async function spoolCsvBatch(settings, fillPage, onProgress) {
  const batchId = await invoke("start_csv_batch", settings);
  try {
    const bytes = new Uint8Array(4 + settings.width * settings.height * 4);
    new DataView(bytes.buffer).setUint32(0, batchId, true);
    const pixels = bytes.subarray(4);
    for (let page = 0; page < settings.pages; page++) {
      onProgress(`Preparing label ${page + 1} of ${settings.pages}…`);
      await fillPage(page, pixels);
      await invoke("append_csv_page", bytes);
    }
    onProgress("Submitting the batch to Windows…");
    const id = await invoke("finish_csv_batch", { batchId });
    trackPrintJob(id, settings.printerName);
    return id;
  } catch (error) {
    await invoke("cancel_csv_batch", { batchId }).catch(() => {});
    throw error;
  }
}

if (invoke) setupCsvPrinting({
  getDesign() {
    finishInlineText(true);
    const entry = library.designs[library.active];
    const newId = !entry.id;
    if (newId) entry.id = crypto.randomUUID();
    const newElementIds = identifyElements(label);
    if (newId || newElementIds) persistLibrary(library);
    const design = structuredClone(currentDesign());
    design.id = entry.id;
    return design;
  },
  async getPrinters() {
    await printersReady;
    return { names: listPrinterNames(), selected: printer.value };
  },
  getPrinter(name, design) {
    if (name === printer.value) {
      if (!feedOffset.validity.valid || !sidewaysOffset.validity.valid) throw new Error("Check this printer’s offsets in Label setup.");
      return { name, feed: feedOffset.valueAsNumber, sideways: sidewaysOffset.valueAsNumber,
        dpi: Number(printDpi.value) || design.dpi, tone: printTone(toneControl.value, name) };
    }
    const profile = readStockProfile(name, design);
    const feed = Number(profile["feed-offset"]);
    const sideways = Number(profile["sideways-offset"]);
    const dpi = Number(profile.dpi) || design.dpi;
    if (!(Math.abs(feed) <= 10 && Math.abs(sideways) <= 10 && [203, 300].includes(dpi))) {
      throw new Error("Check this printer’s saved stock settings in Label setup.");
    }
    return { name, feed, sideways, dpi, tone: printTone(profile.tone, name) };
  },
  checkDesign(context, design, target, mappedText) {
    if (textBoxOverflows(context, design)) throw new Error("Text does not fit its text box at the minimum font size.");
    if (barcodeTooSmall(design)) throw new Error(`Enlarge the QR Code or Data Matrix for ${design.dpi} dpi output.`);
    if (barcodeWouldClip(context, design)) throw new Error("A barcode extends beyond the label, including its required blank margins.");
    const offset = printOffsets(design, target?.feed ?? 0, target?.sideways ?? 0);
    if (target && barcodeWouldClip(context, design, offset.sidewaysMm, offset.feedMm)) {
        throw new Error("The printer offsets would clip a barcode.");
    }
    for (const { element, column } of mappedText) {
      const bounds = elementBounds(context, element);
      if (outsideLabel(bounds, design)) throw new Error(`${column} does not fit its text element on the label.`);
      if (outsideLabel(bounds, design, offset.sidewaysMm, offset.feedMm)) {
        throw new Error(`The printer offsets would clip text from ${column}.`);
      }
    }
  },
  async renderPreview(design, target) {
    const raster = await renderOutput(design, undefined, false);
    const offset = printOffsets(design, target?.feed ?? 0, target?.sideways ?? 0);
    return finishPrintRaster(raster, design, offset, target?.tone ?? "driver");
  },
  paintPreview: paintPrintPreview,
  setBusy: setPrintBusy,
  async sendBatch({ first, last, designAt, target, onProgress }) {
    const design = designAt(first);
    const width = Math.round(design.width * design.dpi / millimetresPerInch);
    const height = Math.round(design.height * design.dpi / millimetresPerInch);
    const settings = {
      printerName: target.name, width, height,
      widthTenths: Math.round(design.width * 10), heightTenths: Math.round(design.height * 10),
      pages: last - first + 1
    };
    const keepPages = width * height * 4 * settings.pages <= 16 * 1024 * 1024;
    const parts = [];
    const offset = printOffsets(design, target.feed, target.sideways);
    const id = await spoolCsvBatch(settings, async (page, pixels) => {
      const canvas = await renderOutput(page === 0 ? design : designAt(first + page), offset);
      writePrintPixels(finishPrintRaster(canvas, design, offset, target.tone), pixels);
      if (keepPages) parts.push(pixels.slice());
    }, onProgress);
    const batch = keepPages ? { settings, rasters: new Blob(parts) } : undefined;
    void rememberJob({ id, batch, title: "CSV batch",
      summary: `${target.name} · ${design.width} × ${design.height} mm · ${settings.pages} labels` }).catch(() => {});
  }
});

controls.print.onclick = () => printLabel();
printCalibration.onclick = () => printLabel(true);

const proofDialog = document.querySelector("#print-proof-dialog");
const proofFrame = document.querySelector("#print-proof-frame");
const proofZoom = document.querySelector("#print-proof-zoom");
const proofSend = document.querySelector("#print-proof-send");
const proofStatus = document.querySelector("#print-proof-status");
const proofCanvas = document.querySelector("#print-proof-canvas");
let proofRequest = 0;
proofSend.hidden = !invoke;
document.querySelector("#print-proof-open").onclick = async () => {
  if (label.media === "inkjet") return openInkjetSheet();
  finishInlineText(true);
  const version = ++proofRequest;
  const design = structuredClone(currentDesign());
  const hasPrinter = Boolean(invoke && printer.value);
  if (hasPrinter && printDpi.value) design.dpi = Number(printDpi.value);
  const validOffsets = !hasPrinter || offsetControls.every(input => input.validity.valid);
  const calibrated = printOffsets(design, hasPrinter && validOffsets ? feedOffset.valueAsNumber : 0,
    hasPrinter && validOffsets ? sidewaysOffset.valueAsNumber : 0);
  const tone = printTone(toneControl.value, hasPrinter ? printer.value : "");
  const zebra = hasPrinter && usesFullSizeZebra(design, printer.value, tone);
  const offset = zebra ? printOffsets(design, 0, 0) : calibrated;
  proofFrame.removeAttribute("data-actual");
  proofZoom.setAttribute("aria-pressed", "false");
  proofZoom.textContent = "Actual dots";
  proofStatus.textContent = "Preparing preview…";
  proofSend.disabled = true;
  proofCanvas.hidden = true;
  document.querySelector("#print-proof-summary").textContent = `${design.width} × ${design.height} mm · ${design.dpi} dpi${zebra && validOffsets ? ` · Zebra feed ${feedOffset.valueAsNumber.toFixed(1)} mm` : tone === "thermal" ? " · Thermal dots" : ""}${hasPrinter ? ` · ${printer.value}` : ""}`;
  proofDialog.showModal();
  try {
    const [raster, area] = await Promise.all([
      renderOutput(design, undefined, false),
      hasPrinter && !zebra ? invoke("printable_area", {
        printer: printer.value,
        widthTenths: Math.round(design.width * 10),
        heightTenths: Math.round(design.height * 10),
      }).catch(() => null) : null,
    ]);
    if (!proofDialog.open || proofRequest !== version) return;
    const frame = finishPrintRaster(raster, design, offset, tone);
    paintPrintPreview(proofCanvas, area
      ? previewOnStock(frame, design, offset, area, raster.getContext("2d")) : frame, design);
    const context = proofCanvas.getContext("2d");
    proofCanvas.hidden = false;
    const clipped = barcodeWouldClip(context, design)
      || barcodeWouldClip(context, design, offset.sidewaysMm, offset.feedMm);
    const textOverflow = textBoxOverflows(context, design);
    const denseBarcode = barcodeTooSmall(design);
    proofStatus.textContent = clipped ? "A barcode or its blank margins are clipped."
      : denseBarcode ? `Enlarge the QR Code or Data Matrix for ${design.dpi} dpi output.`
      : textOverflow ? "Text does not fit its text box at the minimum font size."
      : !validOffsets ? "Check the printer offsets in Label setup."
      : imageWouldClip(context, design, offset, area ?? undefined) ? "An image is cropped in this preview. Use Fit image to print area in Properties to keep it inside."
      : hasPrinter && !zebra && !area ? "The Windows driver’s printable area could not be read. This preview shows the image sent to the driver." : "";
    proofSend.disabled = design.media === "sheet" || !hasPrinter || !validOffsets || clipped
      || denseBarcode || textOverflow || controls.print.disabled;
  } catch (error) {
    if (proofDialog.open && proofRequest === version) proofStatus.textContent = error.message;
  }
};
document.querySelector("#print-proof-close").onclick = () => proofDialog.close();
proofZoom.onclick = () => {
  const actual = proofFrame.toggleAttribute("data-actual");
  proofZoom.setAttribute("aria-pressed", String(actual));
  proofZoom.textContent = actual ? "Fit to window" : "Actual dots";
};
proofSend.onclick = () => { proofDialog.close(); controls.print.click(); };
reprint.onclick = async () => {
  if (!lastLabelJob || controls.print.disabled) return;
  setPrintBusy(true);
  try {
    await submitPrintJob(lastLabelJob);
    controls.status.textContent = lastLabelJob.count === 1
      ? "One label sent to the printer." : `${lastLabelJob.count} labels sent to the printer.`;
  } catch (error) {
    controls.status.textContent = `Reprint failed. ${error.message ?? error}`;
  } finally {
    setPrintBusy(false);
  }
};
calibrationForm.onsubmit = event => {
  event.preventDefault();
  if (!calibrationSample) return;
  const measure = name => calibrationForm.elements.namedItem(name).valueAsNumber;
  const feed = calibrationSample.feedMm + (measure("bottom") - measure("top")) / 2;
  const sideways = calibrationSample.sidewaysMm + (measure("right") - measure("left")) / 2;
  if (Math.abs(feed) > 10 || Math.abs(sideways) > 10) {
    calibrationStatus.textContent = "The correction exceeds 10 mm. Check the stock size and measurements.";
    return;
  }
  feedOffset.value = (Math.round(feed * 10) / 10).toFixed(1);
  sidewaysOffset.value = (Math.round(sideways * 20) / 20).toFixed(2);
  updateCalibrationGuide();
  schedulePreview();
  calibrationStatus.textContent = saveOffsets()
    ? `Saved feed ${feedOffset.value} mm and sideways ${sidewaysOffset.value} mm.`
    : "Could not save this stock profile.";
};

document.addEventListener("keydown", event => {
  const modalOpen = Boolean(document.querySelector("dialog[open]"));
  if (event.key === "Delete" && !event.defaultPrevented && !event.isComposing
      && !event.ctrlKey && !event.metaKey && !event.altKey && !modalOpen
      && !inlineEdit && !(event.target instanceof Element
        && (event.target.isContentEditable || event.target.closest("input, textarea, select:not(#elements)")))
      && selectionIndices().length) {
    event.preventDefault();
    if (!event.repeat) deleteSelection();
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    if (modalOpen) {
      if (event.key.toLowerCase() === "p") event.preventDefault();
      return;
    }
    if (invoke && event.key.toLowerCase() === "f") {
      event.preventDefault();
      finishInlineText(true);
      showInspector("designs");
      controls["design-search"].focus();
      controls["design-search"].select();
      return;
    }
    if (event.key.toLowerCase() === "p") {
      event.preventDefault();
      if (invoke) controls.print.click();
      else exportPdf();
    }
    if (event.key.toLowerCase() === "z" && !event.target.matches("input, textarea, select")) {
      event.preventDefault();
      if (event.shiftKey) controls.redo.click();
      else controls.undo.click();
    }
  }
});
const stageViewport = document.querySelector("#stage-viewport");
const canvasZoom = document.querySelector("#canvas-zoom");
const stage = controls.stage;
let panDrag;

function stopPanning() {
  if (!panDrag) return;
  const { pointerId } = panDrag;
  panDrag = undefined;
  delete stage.dataset.panning;
  if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
}

stage.addEventListener("pointerdown", event => {
  const background = event.button === 0 && event.target === stage;
  if (panDrag || drag || (!background && event.button !== 1)) return;
  event.preventDefault();
  event.stopPropagation();
  finishInlineText(true);
  closePieMenu();
  const [x, y] = canvas.style.translate.split(" ").map(value => parseFloat(value) || 0);
  panDrag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: x ?? 0, y: y ?? 0, background, moved: false };
  stage.setPointerCapture(event.pointerId);
}, true);

stage.addEventListener("pointermove", event => {
  if (panDrag?.pointerId !== event.pointerId) return;
  const dx = event.clientX - panDrag.clientX;
  const dy = event.clientY - panDrag.clientY;
  if (!panDrag.moved && Math.hypot(dx, dy) < 4) return;
  panDrag.moved = true;
  stage.dataset.panning = "";
  pan = { x: panDrag.x + dx, y: panDrag.y + dy };
  schedulePreview();
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  stage.addEventListener(type, event => {
    if (event.pointerId !== panDrag?.pointerId) return;
    const deselect = type === "pointerup" && panDrag.background && !panDrag.moved
      && Math.hypot(event.clientX - panDrag.clientX, event.clientY - panDrag.clientY) < 4;
    stopPanning();
    if (deselect) {
      selected = -1;
      multiSelection.clear();
      syncControls();
      canvas.focus({ preventScroll: true });
    }
  });
}

stage.addEventListener("auxclick", event => {
  if (event.button === 1) event.preventDefault();
});

document.querySelector("#center-label").onclick = () => {
  stopPanning();
  pan = { x: 0, y: 0 };
  stageViewport.scrollTo((stage.scrollWidth - stageViewport.clientWidth) / 2,
    (stage.scrollHeight - stageViewport.clientHeight) / 2);
  schedulePreview();
};
canvasZoom.onchange = () => {
  schedulePreview();
};
new ResizeObserver(schedulePreview).observe(stageViewport);
syncLibraryControls();
syncControls();

