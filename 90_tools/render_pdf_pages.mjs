import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");
const pdfjsPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = pathToFileURL(
  path.join(pdfjsRoot, "standard_fonts") + path.sep
).href;
const pdfjsLib = await import(pathToFileURL(pdfjsPath).href);

const workspaceRoot = process.cwd();
const pdfPath = path.join(
  workspaceRoot,
  "04_analisis_y_entregables",
  "informes",
  "resumen_ejecutivo_ia_pulycort.pdf"
);
const outDir = path.join(
  workspaceRoot,
  "04_analisis_y_entregables",
  "informes",
  "_pages_resumen_ejecutivo_ia_pulycort"
);
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjsLib.getDocument({
  data,
  disableWorker: true,
  useSystemFonts: true,
  standardFontDataUrl,
}).promise;

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const outPath = path.join(outDir, `page-${pageNum}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(outPath);
}
