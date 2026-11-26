import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/src/editor.mjs", ["src/editor.mjs", "text/javascript"]],
  ["/src/label.mjs", ["src/label.mjs", "text/javascript"]],
  ["/src/csv.mjs", ["src/csv.mjs", "text/javascript"]],
  ["/src/csv-print.mjs", ["src/csv-print.mjs", "text/javascript"]],
  ["/src/library-files.mjs", ["src/library-files.mjs", "text/javascript"]],
  ["/src/print-history.mjs", ["src/print-history.mjs", "text/javascript"]],
  ["/src/print-raster.mjs", ["src/print-raster.mjs", "text/javascript"]],
  ["/src/glabels-import.mjs", ["src/glabels-import.mjs", "text/javascript"]],
  ["/src/inkjet-sheets.mjs", ["src/inkjet-sheets.mjs", "text/javascript"]],
  ["/src/thermal-printers.mjs", ["src/thermal-printers.mjs", "text/javascript"]],
  ...["glabels/introduction-glabels-main-window.png", "glabels/print-merge.png", "label-it/thermal-raster-test.png", "label-it/printer-welcome.png"]
    .map(image => [`/references/${image}`, [`references/${image}`, "image/png"]]),
  ["/src/vendor/bwip-js-gen.mjs", ["src/vendor/bwip-js-gen.mjs", "text/javascript"]],
  ["/src/vendor/bwipp.mjs", ["src/vendor/bwipp.mjs", "text/javascript"]]
]);

const host = process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1";
const port = Number(process.argv.slice(2).find(argument => argument !== "--lan") ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a port from 1 to 65535.");
const server = createServer(async (request, response) => {
  if (request.url === "/app-info.json") {
    try {
      const config = await readFile(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8");
      const { version } = JSON.parse(config);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ version }));
    } catch {
      response.writeHead(500).end();
    }
    return;
  }
  const asset = assets.get(request.url);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(asset[0], import.meta.url));
    response.writeHead(200, { "Content-Type": `${asset[1]}; charset=utf-8` }).end(body);
  } catch {
    response.writeHead(500).end();
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. To start another instance, run node serve.mjs with a different port.`);
  } else {
    console.error(`Could not start Label-IT. ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Label-IT is available at http://127.0.0.1:${port}`);
  if (host === "0.0.0.0") console.log(`On your local network, open http://<host-ip>:${port}.`);
});

