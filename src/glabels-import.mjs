import { isBarcodeValue } from "./label.mjs";
import { readDesignEntry } from "./library-files.mjs";

const fileLimit = 12 * 1024 * 1024;
const units = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
const barcodeFormats = { code39: "code39", code128: "code128", qrcode: "qrcode", iec16022: "datamatrix", datamatrix: "datamatrix" };
const enabled = value => value === "true" || value === "1";
const child = (node, name) => Array.from(node.children).find(element => element.localName === name);

function length(node, attribute, fallback) {
  const raw = node.getAttribute(attribute);
  if (raw === null) return fallback;
  const match = raw.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc)?$/i);
  if (!match) throw new Error(`The gLabels file has an invalid ${attribute} measurement.`);
  return Number(match[1]) * units[(match[2] ?? "pt").toLowerCase()];
}

async function readXml(file) {
  if (file.size > fileLimit) throw new Error("Choose a gLabels file smaller than 12 MB.");
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const compressed = signature[0] === 0x1f && signature[1] === 0x8b;
  const stream = compressed ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let xml = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > fileLimit) {
      await reader.cancel();
      throw new Error("The expanded gLabels document exceeds 12 MB.");
    }
    xml += decoder.decode(value, { stream: true });
  }
  xml += decoder.decode();
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("This gLabels file uses an external or custom XML declaration.");
  return new DOMParser().parseFromString(xml, "application/xml");
}

function readText(node, warnings) {
  const span = child(node, "Span") ?? node;
  const paragraphs = Array.from(span.children).filter(element => element.localName === "p");
  const parts = paragraphs.length ? paragraphs : [span];
  const text = parts.map(part => Array.from(part.childNodes, piece => {
    if (piece.nodeType === 3 || piece.nodeType === 4) {
      return /\n/.test(piece.textContent) && !piece.textContent.trim() ? "" : piece.textContent;
    }
    if (piece.localName === "NL") return "\n";
    if (piece.localName === "Field") warnings.add("Merge fields became editable placeholders.");
    return piece.localName === "Field" ? `{${piece.getAttribute("name") ?? "Field"}}` : "";
  }).join("")).join("\n");
  if (!text.trim()) return null;
  warnings.add("Text uses Label-IT’s font and layout. Check its appearance before printing.");
  const element = { type: "text", text, size: Math.max(1, length(span, "font_size", 3.5)) };
  const width = length(node, "w", 0);
  if (width >= 1 && width <= 220 && node.getAttribute("wrap") !== "none") element.wrapWidth = width;
  return element;
}

function readBarcode(node, warnings) {
  const style = node.getAttribute("style")?.toLowerCase();
  const format = Object.hasOwn(barcodeFormats, style) ? barcodeFormats[style] : undefined;
  const text = node.getAttribute("data");
  if (!format || !text || !isBarcodeValue(text, format)) return null;
  warnings.add("Barcodes use Label-IT’s rendering. Verify their size and scan before printing.");
  return { type: "barcode", format, text, size: Math.max(1, length(node, "h", 10)) };
}

async function readImage(node, embedded, warnings) {
  const file = embedded.get(node.getAttribute("src"));
  const mime = file?.getAttribute("mimetype");
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime) || file.getAttribute("encoding")?.toLowerCase() !== "base64") return null;
  const data = file.textContent.replace(/\s/g, "");
  const size = length(node, "w", 0);
  const height = length(node, "h", 0);
  if (size < 1 || height <= 0 || !/^[A-Za-z\d+/]+={0,2}$/.test(data)) return null;
  const source = `data:${mime};base64,${data}`;
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    warnings.add("An embedded image could not be opened.");
    return null;
  }
  return { type: "image", name: "Imported image", size, ratio: height / size, source };
}

export async function readGlabelsDesign(file) {
  const document = await readXml(file);
  const root = document.documentElement;
  if (root?.localName !== "Glabels-document") throw new Error("Choose a gLabels 3 or 4 design (.glabels or .glabel).");
  const template = child(root, "Template");
  const objects = Array.from(root.children).filter(element => element.localName === "Objects");
  if (!template || objects.length !== 1 || enabled(objects[0].getAttribute("rotate"))) {
    throw new Error("This importer supports single-sided gLabels designs in the stock’s original orientation.");
  }
  const stock = Array.from(template.children).find(element => element.localName.startsWith("Label-")
    && (objects[0].getAttribute("id") === null || element.getAttribute("id") === objects[0].getAttribute("id")));
  if (!stock || !["Label-rectangle", "Label-round", "Label-continuous"].includes(stock.localName)) {
    throw new Error("Choose a gLabels design with rectangular, round, or continuous stock.");
  }
  const radius = length(stock, "radius", 0);
  const width = length(stock, "width", radius * 2);
  const height = length(stock, "height", length(stock, "default_height", radius * 2));
  const label = { width, height, dpi: 203, cornerRadius: length(stock, "round", radius), elements: [] };
  const warnings = new Set();
  if (Array.from(stock.children).some(layout => layout.localName === "Layout"
    && (Number(layout.getAttribute("nx")) > 1 || Number(layout.getAttribute("ny")) > 1))) {
    warnings.add("Imported one label from the sheet layout.");
  }
  if (child(root, "Merge")) warnings.add("Reconnect the data source using Print from CSV.");
  const embedded = new Map();
  for (const data of Array.from(root.children).filter(node => node.localName === "Data")) {
    for (const file of data.children) if (file.localName === "File") embedded.set(file.getAttribute("name"), file);
  }
  let skipped = 0;
  for (const node of objects[0].children) {
    const transformed = [1, 0, 0, 1, 0, 0].some((value, index) => {
      const attr = node.getAttribute(`a${index}`);
      return attr !== null && Number(attr) !== value;
    });
    const element = transformed ? null
      : node.localName === "Object-text" ? readText(node, warnings)
      : node.localName === "Object-barcode" ? readBarcode(node, warnings)
      : node.localName === "Object-image" ? await readImage(node, embedded, warnings) : null;
    if (!element) {
      skipped++;
      continue;
    }
    label.elements.push({ ...element, x: length(node, "x", 0), y: length(node, "y", 0) });
  }
  if (skipped && !label.elements.length) {
    throw new Error(["This design contains no objects that Label-IT can import.", ...warnings].join(" "));
  }
  if (skipped) warnings.add(`Skipped ${skipped} unsupported ${skipped === 1 ? "object" : "objects"}.`);
  const name = file.name.replace(/\.(?:glabels?|xml)(?:\.gz)?$/i, "").trim() || "Imported gLabels design";
  return { ...readDesignEntry({ name, label }), warnings: Array.from(warnings) };
}
