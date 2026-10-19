import express from "express";
import path from "path";
import { requireAdmin, requireSameOrganization } from "../middleware/auth.js";
import { respondToServiceError } from "../services/errors.js";
import { getBoardReport } from "../services/boardReportService.js";
import { renderBoardReportPdf } from "../services/boardReportPdfService.js";
import { renderBoardReport } from "../utils/renderBoardReport.js";

const router = express.Router();

// GET /api/reports/board-report
// Query params: period (month|quarter|year|custom), startDate, endDate, hourlyRate, format (json|html|pdf)
router.get("/board-report", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const { period, startDate, endDate, hourlyRate, format } = req.query;
    const data = await getBoardReport({
      organizationId: req.user.organizationId,
      period,
      startDate,
      endDate,
      hourlyRate,
    });

    // Return HTML if format=html
    if (format === "html") {
      const html = renderBoardReport(data);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    if (format === "pdf") {
      // Keep PDF one-page friendly by trimming long idea lists.
      // Resolve relative logoUrl to an absolute backend URL so Playwright can fetch it from within
      // the container. Only /uploads/ paths are allowed; any absolute URL from a different origin
      // is silently dropped to prevent SSRF via a tampered logoUrl in the database.
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
      const org = data.meta?.organization || {};
      let resolvedLogoUrl = null;
      // Only allow /uploads/ paths. Normalise first so that stored values like
      // /uploads/../etc/passwd cannot bypass the prefix check via path traversal.
      // Protocol-relative URLs (//host/...) also start with '/' so the raw check
      // was insufficient; path.normalize collapses them to a single-segment path
      // that will not start with /uploads/ and is thus rejected.
      const normLogoUrl = org.logoUrl ? path.normalize(org.logoUrl) : null;
      if (normLogoUrl?.startsWith("/uploads/")) {
        resolvedLogoUrl = `${backendUrl}${normLogoUrl}`;
      }

      const pdfData = {
        ...data,
        meta: {
          ...data.meta,
          organization: { ...org, logoUrl: resolvedLogoUrl },
        },
        topIdeas: (data.topIdeas || []).slice(0, 3),
        recommendations: (data.recommendations || []).slice(0, 3),
      };

      const html = renderBoardReport(pdfData);
      const pdfBuffer = await renderBoardReportPdf(html);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="executive-board-report.pdf"');
      return res.send(pdfBuffer);
    }

    // Default: return JSON
    res.json(data);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to generate board report",
      logContext: "Board report error:",
    });
  }
});

export default router;
