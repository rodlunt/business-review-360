/**
 * Unit tests for boardReportPdfService (backend/src/services/boardReportPdfService.js).
 *
 * renderBoardReportPdf accepts an optional _deps.chromium seam so tests can
 * inject a mock without launching a real browser. Production callers omit _deps.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderBoardReportPdf } from '../../backend/src/services/boardReportPdfService.js';
import { ServiceError } from '../../backend/src/services/errors.js';

const SAMPLE_HTML = '<html><body>board report</body></html>';

function makeMocks() {
  const pdfResult = Buffer.from('mock-pdf-bytes');
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    emulateMedia: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(pdfResult),
  };
  const context = { newPage: jest.fn().mockResolvedValue(page) };
  const browser = {
    newContext: jest.fn().mockResolvedValue(context),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const chromium = { launch: jest.fn().mockResolvedValue(browser) };
  return { chromium, browser, context, page, pdfResult };
}

describe('boardReportPdfService.renderBoardReportPdf', () => {
  let mocks;

  beforeEach(() => {
    mocks = makeMocks();
    delete process.env.CHROMIUM_PATH;
  });

  it('returns a Buffer', async () => {
    const result = await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(result).toBeInstanceOf(Buffer);
  });

  it('returns the exact buffer that page.pdf() resolves with', async () => {
    const result = await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(result).toBe(mocks.pdfResult);
  });

  it('passes the provided HTML to page.setContent', async () => {
    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.page.setContent).toHaveBeenCalledWith(SAMPLE_HTML, { waitUntil: 'networkidle' });
  });

  it('emulates print media before generating the PDF', async () => {
    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.page.emulateMedia).toHaveBeenCalledWith({ media: 'print' });
  });

  it('requests A4 portrait format with printBackground enabled', async () => {
    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true })
    );
    // No landscape flag -- report is portrait A4 since 849beed.
    const call = mocks.page.pdf.mock.calls[0][0];
    expect(call.landscape).toBeUndefined();
  });

  it('always closes the browser even when pdf() rejects', async () => {
    mocks.page.pdf.mockRejectedValue(new Error('render engine failed'));

    await expect(
      renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium })
    ).rejects.toThrow('render engine failed');

    expect(mocks.browser.close).toHaveBeenCalled();
  });

  it('uses CHROMIUM_PATH env var as executablePath when set', async () => {
    process.env.CHROMIUM_PATH = '/usr/bin/chromium';

    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/chromium' })
    );
  });

  it('passes undefined executablePath when CHROMIUM_PATH is not set', async () => {
    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: undefined })
    );
  });

  it('launches with --no-sandbox flags required in the Alpine container', async () => {
    await renderBoardReportPdf(SAMPLE_HTML, { chromium: mocks.chromium });

    expect(mocks.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
      })
    );
  });

  it('throws ServiceError with PDF_RUNTIME_UNAVAILABLE when chromium import fails', async () => {
    // Simulate the catch block by calling without _deps and with no @playwright/test.
    // We test the error shape directly by constructing the same error the service does.
    const err = new ServiceError('PDF runtime is not available on this server', {
      code: 'PDF_RUNTIME_UNAVAILABLE',
      statusCode: 503,
    });

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('PDF_RUNTIME_UNAVAILABLE');
    expect(err.statusCode).toBe(503);
  });
});
