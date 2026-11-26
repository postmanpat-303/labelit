import bwip from "./vendor/bwip-js-gen.mjs";

export const millimetresPerInch = 25.4;
export const extraShapes = {
  triangle: { name: "Triangle", symbol: "△", points: [[.5, 0], [1, 1], [0, 1]] },
  diamond: { name: "Diamond", symbol: "◇", points: [[.5, 0], [1, .5], [.5, 1], [0, .5]] },
  pentagon: { name: "Pentagon", symbol: "⬠", points: [[.5, 0], [1, .38], [.81, 1], [.19, 1], [0, .38]] },
  hexagon: { name: "Hexagon", symbol: "⬡", points: [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]] },
  octagon: { name: "Octagon", symbol: "⯃", points: [[.29, 0], [.71, 0], [1, .29], [1, .71], [.71, 1], [.29, 1], [0, .71], [0, .29]] },
  star: { name: "Star", symbol: "☆", points: [[.5, 0], [.62, .35], [1, .37], [.7, .61], [.81, 1], [.5, .77], [.19, 1], [.3, .61], [0, .37], [.38, .35]] },
  cross: { name: "Cross", symbol: "＋", points: [[.34, 0], [.66, 0], [.66, .34], [1, .34], [1, .66], [.66, .66], [.66, 1], [.34, 1], [.34, .66], [0, .66], [0, .34], [.34, .34]] },
  arrow: { name: "Arrow", symbol: "⇨", points: [[0, .32], [.58, .32], [.58, 0], [1, .5], [.58, 1], [.58, .68], [0, .68]] },
  chevron: { name: "Chevron", symbol: "❯", points: [[0, 0], [.52, 0], [1, .5], [.52, 1], [0, 1], [.48, .5]] },
  trapezoid: { name: "Trapezoid", symbol: "⏢", points: [[.23, 0], [.77, 0], [1, 1], [0, 1]] }
};
export const shapeNames = {
  rectangle: "Rectangle", ellipse: "Ellipse", line: "Line",
  ...Object.fromEntries(Object.entries(extraShapes).map(([key, shape]) => [key, shape.name]))
};

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";
// Code 39 symbol patterns. Each set bit marks one wide bar or space.
const patterns = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
  0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c,
  0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8,
  0x0a2, 0x08a, 0x02a, 0x094
];
const moduleWidth = 0.375;

export function isCode39(text) {
  return /^[0-9A-Z .$/+%-]{1,40}$/.test(text) && text.trim().length > 0;
}

export function code39(text) {
  if (!isCode39(text)) throw new Error("Invalid Code 39 value.");
  const bars = [];
  let offset = 10;
  for (const character of `*${text}*`) {
    const pattern = patterns[alphabet.indexOf(character)];
    for (let index = 0; index < 9; index++) {
      const width = pattern & (1 << (8 - index)) ? 3 : 1;
      if (index % 2 === 0) bars.push([offset * moduleWidth, width * moduleWidth]);
      offset += width;
    }
    offset++;
  }
  return { bars, width: (offset + 9) * moduleWidth };
}

export const barcodeNames = { code39: "Code 39", code128: "Code 128", qrcode: "QR Code", datamatrix: "Data Matrix" };
const barcodeCache = new Map();

export function normaliseBarcode(text, format = "code39") {
  return format === "code39" ? text.toUpperCase() : text;
}

export function barcodeSymbol(text, format = "code39") {
  if (format === "code39") return code39(text);
  if (!["code128", "qrcode", "datamatrix"].includes(format) || !text.trim() || text.length > 1000) {
    throw new Error("Invalid barcode value or format.");
  }
  const key = JSON.stringify([format, text]);
  if (barcodeCache.has(key)) return barcodeCache.get(key);
  const [raw] = bwip.raw(format, text);
  let symbol;
  if (format === "code128") {
    const bars = [];
    let offset = 10;
    raw.sbs.forEach((units, index) => {
      if (index % 2 === 0) bars.push([offset * moduleWidth, units * moduleWidth]);
      offset += units;
    });
    symbol = { bars, width: (offset + 10) * moduleWidth };
  } else {
    symbol = { matrix: raw.pixs, columns: raw.pixx, rows: raw.pixy, quiet: format === "qrcode" ? 4 : 1 };
  }
  if (barcodeCache.size >= 128) barcodeCache.delete(barcodeCache.keys().next().value);
  barcodeCache.set(key, symbol);
  return symbol;
}

export function isBarcodeValue(text, format) {
  try {
    barcodeSymbol(text, format);
    return true;
  } catch {
    return false;
  }
}

export function barcodeAtResolution(element, dpi) {
  const symbol = barcodeSymbol(element.text, element.format);
  if (!symbol.matrix) return true;
  const modules = Math.max(symbol.columns, symbol.rows) + symbol.quiet * 2;
  return element.size * dpi / millimetresPerInch / modules >= 2;
}

export function textFontFamily(element) {
  return ["serif", "monospace"].includes(element?.fontFamily) ? element.fontFamily : "sans-serif";
}

export function layoutText(context, element) {
  const scaleX = element.scaleX ?? 1;
  const boxWidth = element.wrapWidth;
  const heightLimit = element.fitHeight;
  const minimum = Math.min(element.size, element.minimumSize ?? 2);

  function layout(size) {
    context.font = `${size}px ${textFontFamily(element)}`;
    const widthOf = value => context.measureText(value).width * scaleX;
    const lines = element.text.split("\n").flatMap(line => {
      if (!boxWidth || widthOf(line) <= boxWidth) return [line];
      const wrapped = [];
      let current = "";
      for (const word of line.trim().split(/\s+/u)) {
        const candidate = current ? `${current} ${word}` : word;
        if (widthOf(candidate) <= boxWidth) { current = candidate; continue; }
        if (current) wrapped.push(current);
        current = "";
        for (const character of word) {
          if (current && widthOf(current + character) > boxWidth) {
            wrapped.push(current);
            current = "";
          }
          current += character;
        }
      }
      wrapped.push(current);
      return wrapped;
    });
    const height = size * (1 + (lines.length - 1) * 1.2);
    const contentWidth = lines.reduce((widest, line) => Math.max(widest, widthOf(line)), 0);
    return { lines, size, height, width: boxWidth ?? Math.max(2 * scaleX, contentWidth),
      fits: (!heightLimit || height <= heightLimit + 1e-8) && (!boxWidth || contentWidth <= boxWidth + 1e-8) };
  }

  let result = layout(element.size);
  if (heightLimit && !result.fits) {
    for (let size = element.size - 0.25; size > minimum && !result.fits; size -= 0.25) result = layout(size);
    if (!result.fits) result = layout(minimum);
  }
  return result;
}

export function elementBounds(context, element) {
  const { x, y, size } = element;
  if (element.type === "shape") return { x, y, width: size, height: element.height };
  if (element.type === "image") return { x, y, width: size, height: size * element.ratio };
  if (element.type === "barcode") {
    const symbol = barcodeSymbol(element.text, element.format);
    return { x, y, width: symbol.matrix ? size : symbol.width * (element.scaleX ?? 1), height: size };
  }
  const bounds = layoutText(context, element);
  return { x, y, width: bounds.width, height: bounds.height };
}

export function drawLabel(context, label, width, height, images) {
  context.setTransform(width / label.width, 0, 0, height / label.height, 0, 0);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, label.width, label.height);
  context.fillStyle = "#111";
  context.textBaseline = "top";
  for (const element of label.elements) {
    if (element.type === "shape") {
      const { x, y, size: w, height: h } = element;
      const stroke = Math.min(0.35, w / 3, h / 3);
      const inset = stroke / 2;
      context.save();
      context.strokeStyle = "#111";
      context.lineWidth = stroke;
      context.lineJoin = "round";
      context.beginPath();
      if (element.shape === "ellipse") {
        context.ellipse(x + w / 2, y + h / 2, w / 2 - inset, h / 2 - inset, 0, 0, Math.PI * 2);
      } else if (element.shape === "line") {
        context.moveTo(x + inset, y + inset);
        context.lineTo(x + w - inset, y + h - inset);
      } else if (Object.hasOwn(extraShapes, element.shape)) {
        extraShapes[element.shape].points.forEach(([px, py], index) => {
          const pointX = x + inset + px * (w - stroke);
          const pointY = y + inset + py * (h - stroke);
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        });
        context.closePath();
      } else {
        context.rect(x + inset, y + inset, w - stroke, h - stroke);
      }
      context.stroke();
      context.restore();
      continue;
    }
    if (element.type === "image") {
      const image = images.get(element.source);
      if (image?.complete && image.naturalWidth) {
        context.drawImage(image, element.x, element.y, element.size, element.size * element.ratio);
      }
      continue;
    }
    if (element.type === "barcode") {
      const symbol = barcodeSymbol(element.text, element.format);
      const barcodeWidth = symbol.matrix ? element.size : symbol.width;
      context.fillStyle = "#fff";
      context.fillRect(element.x, element.y, barcodeWidth, element.size);
      context.fillStyle = "#000";
      if (symbol.matrix) {
        const { matrix, columns, rows, quiet } = symbol;
        const scale = context.getTransform();
        const modules = Math.max(columns, rows) + quiet * 2;
        const available = element.size * Math.min(scale.a, scale.d) / modules;
        const dot = available >= 1 ? Math.floor(available) : available;
        const snap = available >= 1 ? Math.round : value => value;
        const x = snap((element.x + element.size / 2) * scale.a - columns * dot / 2);
        const y = snap((element.y + element.size / 2) * scale.d - rows * dot / 2);
        context.save();
        context.resetTransform();
        for (let index = 0; index < matrix.length; index++) {
          if (matrix[index]) context.fillRect(x + (index % columns) * dot, y + Math.floor(index / columns) * dot, dot, dot);
        }
        context.restore();
      } else {
        const scaleX = element.scaleX ?? 1;
        for (const [offset, barWidth] of symbol.bars) {
          context.fillRect(element.x + offset * scaleX, element.y, barWidth * scaleX, element.size);
        }
      }
      context.fillStyle = "#111";
      continue;
    }
    const layout = layoutText(context, element);
    context.font = `${layout.size}px ${textFontFamily(element)}`;
    context.save();
    context.translate(element.x, element.y);
    const scaleX = element.scaleX ?? 1;
    context.scale(scaleX, 1);
    context.textAlign = ["center", "right"].includes(element.textAlign) ? element.textAlign : "left";
    const anchor = context.textAlign === "center" ? layout.width / 2 : context.textAlign === "right" ? layout.width : 0;
    layout.lines.forEach((line, index) => {
      context.fillText(line, anchor / scaleX, index * layout.size * 1.2);
    });
    context.restore();
  }
}

export function sheetLayout(label, paper, left, top, gapX, gapY, copies) {
  const columns = Math.floor((paper.width - 2 * left + gapX + 1e-8) / (label.width + gapX));
  const rows = Math.floor((paper.height - 2 * top + gapY + 1e-8) / (label.height + gapY));
  if (columns < 1 || rows < 1) throw new Error("The design does not fit inside the sheet margins.");
  const capacity = columns * rows;
  if (copies > capacity) throw new Error(`This layout fits ${capacity} per sheet. Reduce the copies or change the layout.`);
  return Array.from({ length: copies || capacity }, (_, index) => ({
    x: left + (index % columns) * (label.width + gapX),
    y: top + Math.floor(index / columns) * (label.height + gapY)
  }));
}

export function makePdf(grayscale, pixelWidth, pixelHeight, widthMm, heightMm, sheet) {
  return makeSheetPdf([grayscale], pixelWidth, pixelHeight, widthMm, heightMm, {
    width: sheet?.width ?? widthMm,
    height: sheet?.height ?? heightMm,
    pages: [sheet?.positions ?? [{ x: 0, y: 0 }]]
  });
}

export function makeSheetPdf(rasters, pixelWidth, pixelHeight, widthMm, heightMm, sheet) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;
  function append(value) {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    parts.push(bytes);
    length += bytes.length;
  }
  function object(...body) {
    const id = offsets.length;
    offsets.push(length);
    append(`${id} 0 obj\n`);
    body.forEach(append);
    append("\nendobj\n");
  }
  const points = mm => (mm * 72 / millimetresPerInch).toFixed(5);
  const width = points(sheet.width);
  const pageHeight = sheet.height;
  const height = points(pageHeight);
  append("%PDF-1.4\n");
  object("<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>");
  const firstPage = 3 + rasters.length;
  const kids = sheet.pages.map((_, index) => `${firstPage + index * 2} 0 R`).join(" ");
  object(`<< /Type /Pages /Kids [${kids}] /Count ${sheet.pages.length} >>`);
  for (const raster of rasters) {
    object(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace ${sheet.color ? "/DeviceRGB" : "/DeviceGray"} /BitsPerComponent 8 /Filter /FlateDecode /Length ${raster.length} >>\nstream\n`, raster, "\nendstream");
  }
  for (const positions of sheet.pages) {
    const images = [...new Set(positions.map(position => position.raster ?? 0))]
      .map(index => `/Label${index} ${3 + index} 0 R`).join(" ");
    const commands = positions.map(({ x, y, raster = 0 }) =>
      `q\n${points(widthMm)} 0 0 ${points(heightMm)} ${points(x)} ${points(pageHeight - y - heightMm)} cm\n/Label${raster} Do\nQ\n`).join("");
    const contents = offsets.length + 1;
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << ${images} >> >> /Contents ${contents} 0 R >>`);
    object(`<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
  }
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    append(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

