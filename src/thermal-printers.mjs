// Dimensions describe the stock, in millimetres. Printing still uses the
// installed Windows driver, which reports the actual printable rectangle.
const profiles = [
  { name: "NIIMBOT B1 Pro", queue: /\bniimbot[\s_-]+b1[\s_-]*pro\b/i, dpi: 300,
    width: [20, 50], length: [8, 350], printWidth: 48, niimbot: true },
  { name: "NIIMBOT B1", queue: /\bniimbot[\s_-]+b1\b/i, dpi: 203,
    width: [20, 50], length: [20, 200], printWidth: 48, niimbot: true },
  { name: "NIIMBOT B21", queue: /\bniimbot[\s_-]+b21\b(?![\s_-]*pro\b)/i, dpi: 203,
    width: [20, 50], length: [20, 200], printWidth: 48, niimbot: true },
  { name: "Phomemo M110", queue: /\bphomemo[\s_-]*m110\b/i, dpi: 203, width: [20, 50] },
  { name: "Phomemo M220", queue: /\bphomemo[\s_-]*m220\b/i, dpi: 203, width: [20, 75] },
  // Phomemo publishes two width ranges on the product page. Use their overlap.
  { name: "Phomemo PM-241BT", queue: /\b(?:pm[\s_-]*241|phomemo[\s_-]*241)[\s_-]*bt\b/i,
    dpi: 203, width: [40, 104] },
];

export function thermalPrinterProfile(queueName) {
  return profiles.find(profile => profile.queue.test(queueName));
}
