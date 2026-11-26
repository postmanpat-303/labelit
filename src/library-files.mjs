import { isBarcodeValue, shapeNames } from "./label.mjs";

const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
export const fileName = name => name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Label-IT";

export function downloadLibraryFile(name, extension, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName(name)}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readDesignEntry(entry, index = 0) {
  const design = entry?.label;
  if (typeof entry?.name !== "string" || !entry.name.trim() || !within(design?.width, 5, 220)
      || !within(design?.height, 5, 300) || ![203, 300].includes(design?.dpi)
      || (design.media !== undefined && !["label", "sheet", "inkjet", "continuous"].includes(design.media))
      || (design.cornerRadius !== undefined && !within(design.cornerRadius, 0, 110))
      || !Array.isArray(design?.elements)) {
    throw new Error(`Design ${index + 1} has invalid dimensions or contents.`);
  }
  for (const element of design.elements) {
    if (!element || ![undefined, "text", "barcode", "image", "shape"].includes(element.type)
        || !Number.isFinite(element.x) || !Number.isFinite(element.y) || !within(element.size, 1, 220)
        || (element.scaleX !== undefined && !(Number.isFinite(element.scaleX) && element.scaleX > 0))
        || (element.wrapWidth !== undefined && !within(element.wrapWidth, 1, 220))
        || (element.textAlign !== undefined && !["left", "center", "right"].includes(element.textAlign))
        || (element.fitHeight !== undefined && !within(element.fitHeight, 1, 300))
        || (element.minimumSize !== undefined && !within(element.minimumSize, 1, 40))) {
      throw new Error(`Design ${index + 1} contains an invalid element.`);
    }
    if (element.type === "image" && (!(element.ratio > 0) || !Number.isFinite(element.ratio)
        || typeof element.source !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(element.source))) {
      throw new Error(`Design ${index + 1} contains an unsupported image.`);
    }
    if (element.type === "shape" && (!Object.hasOwn(shapeNames, element.shape) || !within(element.height, 0.2, 300))) {
      throw new Error(`Design ${index + 1} contains an invalid shape.`);
    }
    if (!["image", "shape"].includes(element.type) && (typeof element.text !== "string"
        || (element.type === "barcode" && !isBarcodeValue(element.text, element.format)))) {
      throw new Error(`Design ${index + 1} contains invalid text or a barcode.`);
    }
  }
  return {
    ...entry, name: entry.name.trim().slice(0, 80),
    folder: typeof entry.folder === "string" ? entry.folder.slice(0, 60) : "",
    tags: Array.isArray(entry.tags) ? entry.tags.filter(tag => typeof tag === "string").slice(0, 30) : []
  };
}

export function isPrintProfileKey(key) {
  return key.startsWith("labelit-stock-offsets:") || key.startsWith("labelit-feed-offset:")
    || key.startsWith("labelit-sideways-offset:") || key === "labelit-printer";
}

export function readBackup(backup) {
  if (backup?.format !== "labelit-backup" || backup.version !== 1 || !Array.isArray(backup.designs)
      || !Array.isArray(backup.lists) || !Array.isArray(backup.profiles)) throw new Error("Choose a Label-IT backup file.");
  const designs = backup.designs.map(readDesignEntry);
  for (const list of backup.lists) {
    if (!list || typeof list.name !== "string" || !Array.isArray(list.columns)
        || !list.columns.length || list.columns.some(column => typeof column !== "string" || !column)
        || !Array.isArray(list.records) || !list.records.length
        || list.records.some(row => !Array.isArray(row) || row.length !== list.columns.length
          || row.some(value => typeof value !== "string"))) {
      throw new Error("The backup contains an invalid saved list.");
    }
  }
  const profiles = backup.profiles.filter(pair => Array.isArray(pair) && typeof pair[0] === "string"
    && typeof pair[1] === "string" && isPrintProfileKey(pair[0]));
  return { designs, lists: backup.lists, profiles };
}
