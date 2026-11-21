import { thermalPrinterProfile } from "./thermal-printers.mjs";

export function cornerRadius(design) {
  return Math.max(0, Math.min(design.cornerRadius ?? 0, design.width / 2, design.height / 2));
}

export function insideStock(x, y, width, height, radius) {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  if (!radius) return true;
  const dx = Math.max(0, radius - x, x - width + radius);
  const dy = Math.max(0, radius - y, y - height + radius);
  return dx * dx + dy * dy <= radius * radius + 1e-8;
}

export function printTone(mode, printerName) {
  if (mode === "thermal" || mode === "driver") return mode;
  return /zdesigner|zebra/i.test(printerName) || thermalPrinterProfile(printerName) ? "thermal" : "driver";
}

// Calibration moves the artwork in the driver page to compensate for the
// printer's displacement of that page relative to the physical stock.
export function previewOnStock(frame, design, offset, area, context) {
  const { width, height } = frame;
  const result = context.createImageData(width, height);
  result.data.fill(255);
  const radius = cornerRadius(design);
  const [left, top, right, bottom] = area;
  for (let y = 0; y < height; y++) {
    const sourceY = y + offset.y;
    const pageY = (sourceY + 0.5) * design.height / height;
    if (sourceY < 0 || sourceY >= height || pageY < top || pageY >= bottom) continue;
    for (let x = 0; x < width; x++) {
      const sourceX = x + offset.x;
      const pageX = (sourceX + 0.5) * design.width / width;
      if (sourceX < 0 || sourceX >= width || pageX < left || pageX >= right) continue;
      if (!insideStock((x + 0.5) * design.width / width, (y + 0.5) * design.height / height,
        design.width, design.height, radius)) continue;
      const from = (sourceY * width + sourceX) * 4;
      const to = (y * width + x) * 4;
      result.data[to] = frame.data[from];
      result.data[to + 1] = frame.data[from + 1];
      result.data[to + 2] = frame.data[from + 2];
    }
  }
  return result;
}

export function finishPrintRaster(canvas, design, offset, tone) {
  const { width, height } = canvas;
  const frame = canvas.getContext("2d").getImageData(-offset.x, -offset.y, width, height);
  const { data } = frame;
  const radius = cornerRadius(design);
  const thermal = tone === "thermal";
  const stepX = design.width / width;
  const stepY = design.height / height;
  let errors = thermal ? new Float32Array(width + 2) : null;
  let next = thermal ? new Float32Array(width + 2) : null;

  for (let y = 0; y < height; y++) {
    const direction = y % 2 ? -1 : 1;
    for (let column = 0; column < width; column++) {
      const x = direction === 1 ? column : width - 1 - column;
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] / 255;
      if (!alpha || (radius && !insideStock((x + 0.5) * stepX, (y + 0.5) * stepY, design.width, design.height, radius))) {
        data[i] = data[i + 1] = data[i + 2] = 255;
      } else if (thermal) {
        const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha + 255 * (1 - alpha);
        // Keep solid text and barcode bars sharp. Diffuse error only in midtones.
        let dot = luminance < 128 ? 0 : 255;
        if (luminance > 24 && luminance < 250) {
          const value = Math.max(0, Math.min(255, luminance + errors[x + 1]));
          dot = value < 128 ? 0 : 255;
          const error = (value - dot) / 16;
          errors[x + 1 + direction] += error * 7;
          next[x + 1 - direction] += error * 3;
          next[x + 1] += error * 5;
          next[x + 1 + direction] += error;
        }
        data[i] = data[i + 1] = data[i + 2] = dot;
      } else if (alpha < 1) {
        for (let channel = 0; channel < 3; channel++) {
          data[i + channel] = data[i + channel] * alpha + 255 * (1 - alpha);
        }
      }
      data[i + 3] = 255;
    }
    if (thermal) {
      [errors, next] = [next, errors];
      next.fill(0);
    }
  }
  return frame;
}
