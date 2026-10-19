// Contact Routes
// Issue #344: Large org sales contact flow
//
// Handles contact form submissions for sales enquiries

import express from "express";
import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import { requireAdmin } from "../middleware/auth.js";
import { enqueueTemplateEmail, EmailPriority } from "../services/emailQueueService.js";
import { SalesNotification } from "../emails/templates/admin/SalesNotification.jsx";
import { logger } from "../utils/logger.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router. requireAdmin is still imported because it
// guards a protected handler against non-admin users (post-authenticate).
export const publicRouter = express.Router();
export const protectedRouter = express.Router();

/**
 * POST /api/contact/sales
 * Submit a sales enquiry form
 *
 * Body:
 * - companyName: string (required)
 * - contactName: string (required)
 * - email: string (required)
 * - phone: string (optional)
 * - companySize: string (required) - e.g., "1-10", "11-50", etc.
 * - planInterest: string (required) - e.g., "enterprise", "custom"
 * - message: string (optional)
 *
 * Returns:
 * - success: boolean
 * - message: string
 * - enquiryId: number (database record ID)
 */
publicRouter.post("/sales", async (req, res) => {
  try {
    const { companyName, contactName, email, phone, companySize, planInterest, message } = req.body;

    logger.info(
      `[Contact] Sales enquiry - Company: ${companyName}, Email: ${email}, Plan: ${planInterest}`
    );

    // Validate required fields
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        error: "Company name is required",
        code: "MISSING_COMPANY_NAME",
      });
    }

    if (!contactName || !contactName.trim()) {
      return res.status(400).json({
        error: "Contact name is required",
        code: "MISSING_CONTACT_NAME",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        error: "Email is required",
        code: "MISSING_EMAIL",
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email address",
        code: "INVALID_EMAIL",
      });
    }

    if (!companySize) {
      return res.status(400).json({
        error: "Company size is required",
        code: "MISSING_COMPANY_SIZE",
      });
    }

    if (!planInterest) {
      return res.status(400).json({
        error: "Plan interest is required",
        code: "MISSING_PLAN_INTEREST",
      });
    }

    // Insert enquiry into sales_enquiries table
    const [result] = await platformSequelize.query(
      `INSERT INTO sales_enquiries
       (company_name, contact_name, email, phone, company_size, plan_interest, message, status)
       VALUES (:companyName, :contactName, :email, :phone, :companySize, :planInterest, :message, 'new')
       RETURNING id`,
      {
        replacements: {
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone ? phone.trim() : null,
          companySize,
          planInterest,
          message: message ? message.trim() : null,
        },
        type: QueryTypes.INSERT,
      }
    );

    // Sequelize returns [{id}] on Postgres for RETURNING but a scalar rowid on SQLite.
    const enquiryId = Array.isArray(result) ? result[0]?.id : result;

    logger.info(`[Contact] Sales enquiry saved successfully - ID: ${enquiryId}, Email: ${email}`);

    // Notify the sales team. Falls back to EMAIL_FROM when
    // SALES_NOTIFICATION_EMAIL is not set. The helper logs and returns
    // gracefully if no provider is configured (dev mode).
    const salesInbox =
      process.env.SALES_NOTIFICATION_EMAIL || process.env.EMAIL_FROM || process.env.GMAIL_USER;

    if (salesInbox) {
      const emailResult = await enqueueTemplateEmail({
        to: salesInbox,
        subject: `New sales enquiry: ${companyName.trim()} (${planInterest})`,
        template: SalesNotification,
        templateProps: {
          enquiryId,
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone ? phone.trim() : null,
          companySize,
          planInterest,
          message: message ? message.trim() : null,
          submittedAt: new Date().toISOString(),
        },
        replyTo: email.trim().toLowerCase(),
        categories: ["sales", "enquiry"],
        type: "sales-enquiry",
        priority: EmailPriority.NORMAL,
        organizationId: null,
      });

      if (!emailResult.success) {
        logger.warn(
          `[Contact] Sales notification email failed for enquiry ${enquiryId}: ${emailResult.error}`
        );
      }
    } else {
      logger.warn(
        `[Contact] No sales inbox configured (SALES_NOTIFICATION_EMAIL / EMAIL_FROM / GMAIL_USER). Enquiry ${enquiryId} saved without notification.`
      );
    }

    return res.status(201).json({
      success: true,
      message: "Thank you for your interest! Our sales team will contact you within 24 hours.",
      enquiryId,
    });
  } catch (error) {
    logger.error("[Contact] Error processing sales enquiry:", error);

    // Handle unique constraint violations (duplicate emails within short timeframe)
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        error:
          "You have already submitted a sales enquiry recently. Our team will contact you soon.",
        code: "DUPLICATE_ENQUIRY",
      });
    }

    return res.status(500).json({
      error: "Failed to submit enquiry. Please try again or contact us directly.",
      code: "INTERNAL_ERROR",
    });
  }
});

/**
 * GET /api/contact/sales
 * Retrieve all sales enquiries (admin only - for future implementation)
 *
 * Query params:
 * - status: string (optional) - filter by status: 'new', 'contacted', 'closed'
 * - limit: number (optional) - number of records to return
 * - offset: number (optional) - pagination offset
 *
 * Returns:
 * - enquiries: array of enquiry objects
 * - total: number (total count)
 */
protectedRouter.get("/sales", requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = "";
    const replacements = { limit: parseInt(limit), offset: parseInt(offset) };

    if (status) {
      whereClause = "WHERE status = :status";
      replacements.status = status;
    }

    const enquiries = await platformSequelize.query(
      `SELECT id, company_name, contact_name, email, phone, company_size,
              plan_interest, message, status, created_at, updated_at
       FROM sales_enquiries
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    const [countResult] = await platformSequelize.query(
      `SELECT COUNT(*) as total FROM sales_enquiries ${whereClause}`,
      {
        replacements: status ? { status } : {},
        type: QueryTypes.SELECT,
      }
    );

    return res.json({
      enquiries,
      total: parseInt(countResult.total),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error("[Contact] Error fetching sales enquiries:", error);
    return res.status(500).json({
      error: "Failed to fetch enquiries",
      code: "INTERNAL_ERROR",
    });
  }
});
