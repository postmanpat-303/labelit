import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const output = new URL("./dist/", import.meta.url);
await mkdir(new URL("src/vendor/", output), { recursive: true });
await mkdir(new URL("references/glabels/", output), { recursive: true });
await mkdir(new URL("references/label-it/", output), { recursive: true });
const { version } = JSON.parse(await readFile(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8"));
await writeFile(new URL("app-info.json", output), JSON.stringify({ version }));
await Promise.all(
  ["index.html", "style.css", "src/editor.mjs", "src/label.mjs", "src/csv.mjs", "src/csv-print.mjs", "src/library-files.mjs", "src/print-history.mjs", "src/print-raster.mjs",
    "src/glabels-import.mjs", "src/inkjet-sheets.mjs", "src/thermal-printers.mjs", "src/vendor/bwip-js-gen.mjs", "src/vendor/bwipp.mjs", "src/vendor/BWIP-JS-LICENSE.txt", "src/vendor/INCONSOLATA-LICENSE.txt",
    "references/glabels/introduction-glabels-main-window.png", "references/glabels/print-merge.png",
    "references/label-it/thermal-raster-test.png", "references/label-it/printer-welcome.png"].map(
    asset => copyFile(new URL(asset, import.meta.url), new URL(asset, output))
  )
);
