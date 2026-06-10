const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const pdfPath = path.join(
    root,
    "04_analisis_y_entregables",
    "informes",
    "resumen_ejecutivo_ia_pulycort.pdf"
  );
  const outPath = path.join(
    root,
    "04_analisis_y_entregables",
    "informes",
    "_preview_resumen_ejecutivo_ia_pulycort_playwright.png"
  );

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1600 } });
  const baseUrl = "file:///" + pdfPath.replace(/\\/g, "/");
  const outputs = [outPath];
  for (const pageNum of [1, 2, 4, 5]) {
    await page.goto(`${baseUrl}#page=${pageNum}`, {
      waitUntil: "load",
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    const target =
      pageNum === 1
        ? outPath
        : path.join(
            root,
            "04_analisis_y_entregables",
            "informes",
            `_preview_resumen_ejecutivo_ia_pulycort_playwright_page_${pageNum}.png`
          );
    await page.screenshot({ path: target, fullPage: true });
    outputs.push(target);
  }
  await browser.close();
  console.log(outputs.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
