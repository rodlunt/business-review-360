import { ServiceError } from "./errors.js";

/**
 * Render board report HTML into a one-page PDF buffer.
 * Uses playwright-core with Alpine's system Chromium (CHROMIUM_PATH=/usr/bin/chromium).
 * playwright-core has no bundled browser; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in Dockerfile.
 */
/**
 * @param {string} html
 * @param {{ chromium?: object }} [_deps] - Internal seam for unit tests.
 *   Pass a mock chromium object to avoid launching a real browser.
 *   Production callers omit this argument entirely.
 */
export async function renderBoardReportPdf(html, _deps = {}) {
  let chromium = _deps.chromium;

  if (!chromium) {
    try {
      // @playwright/test is already installed in this repo and exposes chromium.
      ({ chromium } = await import("playwright-core"));
    } catch {
      throw new ServiceError("PDF runtime is not available on this server", {
        code: "PDF_RUNTIME_UNAVAILABLE",
        statusCode: 503,
        details: { hint: "Install Playwright runtime in the backend environment" },
      });
    }
  }

  const browser = await chromium.launch({
    headless: true,
    // CHROMIUM_PATH is set in the Alpine container to /usr/bin/chromium (musl-native).
    // Unset in dev: Playwright falls back to its own bundled Chromium.
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({ locale: "en-AU" });
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });

    // Single-page A4 portrait; 7.5mm margin to maximise usable area.
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: "1",
      margin: {
        top: "7.5mm",
        right: "7.5mm",
        bottom: "7.5mm",
        left: "7.5mm",
      },
    });
  } finally {
    await browser.close();
  }
}

export default { renderBoardReportPdf };
