const point = 25.4 / 72;

// Flat rectangular label grids from gLabels' Avery ISO template catalogue:
// https://github.com/j-evins/glabels-qt/blob/master/templates/avery-iso-templates.xml
function averyStock(id, aliases, dimensions, grid, origin, pitch) {
  const [labelWidth, labelHeight] = dimensions;
  const [columns, rows] = grid;
  const [left, top] = origin;
  const [pitchX, pitchY] = pitch;
  const display = value => Math.round(value * 100) / 100;
  return {
    id, name: `Avery ${id}`, aliases,
    size: `${display(labelWidth)} × ${display(labelHeight)} mm`, paper: "A4",
    width: 210, height: 297, labelWidth, labelHeight, columns, rows, left, top, pitchX, pitchY
  };
}

export const inkjetStocks = [
  {
    id: "J8165", name: "Avery J8165-100", aliases: ["7165", "L7165", "J8165-25", "J8165-100"],
    size: "99.1 × 67.7 mm", paper: "A4", width: 210, height: 297,
    labelWidth: 99.06, labelHeight: 67.73, columns: 2, rows: 4,
    left: 13.2378 * point, top: 36.9638 * point,
    pitchX: 288.113 * point, pitchY: 191.991 * point
  },
  {
    id: "J8160", name: "Avery J8160", aliases: ["7160", "L7160", "J8160-10", "J8160-25", "J8160-100"],
    size: "63.5 × 38.1 mm", paper: "A4", width: 210, height: 297,
    labelWidth: 63.5, labelHeight: 38.1, columns: 3, rows: 7,
    left: 21.2 * point, top: 43.9 * point, pitchX: 187.2 * point, pitchY: 38.1
  },
  averyStock("6121", [], [107.928 * point, 60.12 * point], [5, 13],
    [26.928 * point, 29.736 * point], [107.928 * point, 60.12 * point]),
  averyStock("L4730", [], [17.8, 10], [10, 27], [6, 13], [20.3, 10]),
  averyStock("L4732", [], [35.6, 16.9], [5, 16], [11, 13], [38.1, 16.9]),
  averyStock("L4770", ["J8654", "L6140", "L6145", "L7654"], [45.7, 25.4], [4, 10], [10, 22], [48.5, 25.4]),
  averyStock("L4785", ["L4784", "L4786", "L4787"], [80, 50], [2, 5], [18, 13], [95, 55]),
  averyStock("J8161", ["7161", "L7161"], [63.5, 46.56], [3, 6], [21 * point, 23 * point], [186.9 * point, 132.5 * point]),
  averyStock("L7162", ["7162"], [280.9 * point, 96.1 * point], [2, 8],
    [11.3 * point, 36.8 * point], [290.5 * point, 96.1 * point]),
  averyStock("L7163", ["7163"], [280.9 * point, 38.1], [2, 7], [9.5 * point, 43 * point], [292 * point, 38.1]),
  averyStock("J8164", ["7164", "L7164"], [63.5, 71.967], [3, 4],
    [20.84 * point, 10 * point], [187.08 * point, 204.038 * point]),
  averyStock("L7169", ["7169"], [280.9 * point, 394 * point], [2, 2],
    [14.2 * point, 20 * point], [287.7 * point, 394 * point]),
  averyStock("L7664", ["7664"], [70, 71.9], [2, 4], [17, 5], [104.5, 72]),
  averyStock("J8157", [], [64, 24.3], [3, 11], [6, 14], [66.5, 24.3]),
  averyStock("J8651", ["8651", "L8651", "J8551", "L7651", "L7551"], [38.1, 60.09 * point], [5, 13],
    [13.32 * point, 30.9 * point], [115.09 * point, 60.09 * point]),
  averyStock("J8658", ["8658", "L8658"], [25.4, 10], [7, 27], [5, 13], [28.5, 10.14]),
  averyStock("J8666", ["8666"], [70, 52], [2, 5], [66 * point, 53 * point], [264 * point, 147 * point]),
  averyStock("18036", [], [198 * point, 91 * point], [3, 9], [0, 13 * point], [198 * point, 91 * point]),
  averyStock("38931", ["DL33", "CR33"], [70, 25], [3, 11], [0, 10], [70, 25])
];

export function searchInkjetStocks(value, usage = {}) {
  const query = value.toLowerCase().replace(/×/g, "x").replace(/\s+/g, "");
  const pack = /^(?:avery)?([a-z]*\d+[a-z]*)-\d+$/.exec(query);
  return inkjetStocks.filter(stock => {
    const codes = [stock.id, ...stock.aliases].map(code => code.toLowerCase());
    if (pack) return codes.includes(pack[1]) || codes.includes(query.replace(/^avery/, ""));
    const dimensions = [stock.size, ...[1, 10, 100].map(precision =>
      `${Math.round(stock.labelWidth * precision) / precision}x${Math.round(stock.labelHeight * precision) / precision}`)];
    return [stock.name, ...codes, ...dimensions, stock.paper].some(item =>
      item.toLowerCase().replace(/×/g, "x").replace(/\s+/g, "").includes(query));
  }).sort((left, right) => {
    const a = usage?.[left.id];
    const b = usage?.[right.id];
    return (Number.isSafeInteger(b) && b > 0 ? b : 0) - (Number.isSafeInteger(a) && a > 0 ? a : 0);
  });
}

export function stockPositions(stock) {
  return Array.from({ length: stock.columns * stock.rows }, (_, index) => ({
    x: stock.left + index % stock.columns * stock.pitchX,
    y: stock.top + Math.floor(index / stock.columns) * stock.pitchY
  }));
}

export function numberedFields(design) {
  return design.elements.flatMap((element, index) => {
    if (element.type && element.type !== "text") return [];
    return [...element.text.matchAll(/[0-9]+/g)].map(match => ({
      index, start: match.index, digits: match[0], text: element.text
    }));
  });
}

export function numberedDesign(design, field, start, increment, index) {
  const width = Math.max(start.length, field.digits.length);
  const number = (BigInt(start) + BigInt(increment) * BigInt(index)).toString().padStart(width, "0");
  const text = field.text.slice(0, field.start) + number + field.text.slice(field.start + field.digits.length);
  const elements = design.elements.slice();
  elements[field.index] = { ...elements[field.index], text };
  return { ...design, elements };
}

export function planInkjetSheets(positions, used, mode, selected, quantity) {
  const available = positions.map((position, slot) => ({ ...position, slot }))
    .filter(position => !used.has(position.slot));
  if (mode === "single") {
    const position = available.find(item => item.slot === selected);
    return position ? [[{ ...position, raster: 0 }]] : [];
  }
  if (mode === "fill") return available.length ? [available.map(position => ({ ...position, raster: 0 }))] : [];
  if (!available.length) return [];
  let next = 0;
  const pages = [];
  if (available.length) pages.push(available.slice(0, quantity).map(position => ({ ...position, raster: next++ })));
  while (next < quantity) {
    pages.push(positions.slice(0, quantity - next).map((position, slot) => ({ ...position, slot, raster: next++ })));
  }
  return pages;
}
