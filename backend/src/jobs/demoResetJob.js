/**
 * Demo Reset Job (#566)
 *
 * Runs nightly at 3am (configured timezone) to restore the shared demo-corp
 * org to a clean, representative state. Visitors may write to the demo org
 * freely; this job wipes and re-seeds so each day starts fresh.
 *
 * Safe to run in environments without a demo-corp tenant: the job queries
 * the platform DB for the tenant row and exits early when not found.
 *
 * Schedule: daily 3am (EMAIL_QUEUE_TIMEZONE or DIGEST_TIMEZONE, default UTC)
 */

import cron from "node-cron";
import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import { withTenantContext } from "../utils/withTenantContext.js";
import Idea from "../models/Idea.js";
import Category from "../models/Category.js";
import { logger } from "../utils/logger.js";

const DEMO_ORG_ID = "demo-corp";
// Fixed UUIDs for demo-corp fixture users (mirrored from auth.js).
const DEMO_USER_UUID = "55555555-5555-5555-5555-555555555555";
const DEMO_ADMIN_UUID = "66666666-6666-6666-6666-666666666666";

// Seed categories for the demo org.
const DEMO_CATEGORIES = [
  { name: "Product", description: "Ideas to improve our core product and features" },
  { name: "Operations", description: "Process improvements and efficiency gains" },
  { name: "Customer Experience", description: "Ideas to delight and retain customers" },
  { name: "Engineering", description: "Technical improvements, tooling, and infrastructure" },
  { name: "Marketing", description: "Growth, awareness, and communication ideas" },
];

// Representative seed ideas. Each has enough detail to showcase the
// BR360 review board, priority matrix, and analytics features.
const buildSeedIdeas = (tenantId) => [
  {
    title: "Improve mobile app checkout flow",
    description:
      "The current checkout is 7 steps on mobile. Reducing it to 3 steps with autofill should drop abandonment significantly.",
    category: "Product",
    status: "In Progress",
    isPinned: true,
    impactScore: 9,
    effortScore: 4,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_ADMIN_UUID,
  },
  {
    title: "Add dark mode to the dashboard",
    description:
      "Multiple team members have requested a dark theme. Would reduce eye strain for late-evening users and align with accessibility guidelines.",
    category: "Product",
    status: "Reviewing",
    impactScore: 6,
    effortScore: 5,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Automate weekly status reports",
    description:
      "Manually compiling the Friday status email takes 90 minutes. An automated summary pulling from our task tracker would free up that time every week.",
    category: "Operations",
    status: "Approved",
    impactScore: 7,
    effortScore: 3,
    timeSavedMinutes: 90,
    frequencyCount: 1,
    frequencyPeriod: "week",
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Reduce first-response SLA from 24h to 4h",
    description:
      "Customers consistently mention slow initial responses in NPS comments. Trialling a dedicated first-response queue with a 4-hour SLA should move the NPS needle.",
    category: "Customer Experience",
    status: "Reviewing",
    impactScore: 8,
    effortScore: 6,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Integrate with Slack for idea notifications",
    description:
      "Post a Slack message when a new idea is submitted or a status changes. This would surface ideas to the team without requiring them to log in to BR360.",
    category: "Engineering",
    status: "Reviewing",
    impactScore: 7,
    effortScore: 4,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_ADMIN_UUID,
  },
  {
    title: "Bulk import ideas via CSV",
    description:
      "Several teams have backlogs in spreadsheets. A one-click CSV import would lower the barrier to getting those ideas into the review board.",
    category: "Product",
    status: "Reviewing",
    impactScore: 5,
    effortScore: 4,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Monthly all-hands recap in the idea board",
    description:
      "After each all-hands, copy any new ideas raised into BR360. This creates a single source of truth instead of ideas living in meeting notes.",
    category: "Operations",
    status: "Implemented",
    impactScore: 6,
    effortScore: 2,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_ADMIN_UUID,
  },
  {
    title: "Video onboarding tutorials for new users",
    description:
      "Our current onboarding is text-only. Short screencasts (2-3 min each) covering the core workflows would cut support tickets from new users by an estimated 30%.",
    category: "Marketing",
    status: "Approved",
    impactScore: 7,
    effortScore: 6,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Better inline validation error messages",
    description:
      "Form errors currently appear after submit as a banner. Inline errors on blur would catch mistakes earlier and reduce frustration, especially on longer forms.",
    category: "Engineering",
    status: "Reviewing",
    impactScore: 6,
    effortScore: 3,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Post-ticket customer satisfaction survey",
    description:
      "Send a one-question CSAT survey 24h after a support ticket closes. Data would feed directly into the monthly NPS dashboard.",
    category: "Customer Experience",
    status: "Reviewing",
    impactScore: 8,
    effortScore: 4,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_USER_UUID,
  },
  {
    title: "Keyboard shortcuts for the review board",
    description:
      "Power users reviewing dozens of ideas per day want to navigate and vote without leaving the keyboard. Standard j/k navigation and spacebar-to-vote would cover 80% of the need.",
    category: "Product",
    status: "Reviewing",
    impactScore: 5,
    effortScore: 3,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_ADMIN_UUID,
  },
  {
    title: "Dedicated changelog page for shipped ideas",
    description:
      "When an idea moves to Implemented, publish a changelog entry automatically. Customers and team members can subscribe to see what has shipped.",
    category: "Marketing",
    status: "Reviewing",
    impactScore: 7,
    effortScore: 5,
    organizationId: DEMO_ORG_ID,
    tenant_id: tenantId,
    authorId: DEMO_ADMIN_UUID,
  },
];

export async function runDemoResetJob() {
  logger.info("[DemoReset] Starting demo reset job...");

  // Look up the demo-corp tenant in the platform DB.
  const rows = await platformSequelize.query("SELECT id FROM tenants WHERE org_id = :orgId", {
    replacements: { orgId: DEMO_ORG_ID },
    type: QueryTypes.SELECT,
  });

  if (!rows.length) {
    logger.warn(`[DemoReset] No tenant found for org_id='${DEMO_ORG_ID}'. Skipping reset.`);
    return;
  }

  const tenantId = rows[0].id;

  try {
    await withTenantContext(tenantId, async () => {
      // Cascade order: Idea FK cascades to Votes, Comments, and CommentVotes,
      // so deleting Ideas is sufficient -- no need for explicit child destroys.
      await Idea.destroy({ where: { organizationId: DEMO_ORG_ID } });
      await Category.destroy({ where: { organizationId: DEMO_ORG_ID } });

      // Re-seed categories.
      await Category.bulkCreate(
        DEMO_CATEGORIES.map((c) => ({
          ...c,
          organizationId: DEMO_ORG_ID,
          tenant_id: tenantId,
          createdBy: DEMO_ADMIN_UUID,
        }))
      );

      // Re-seed ideas.
      await Idea.bulkCreate(buildSeedIdeas(tenantId));
    });

    logger.info(`[DemoReset] Demo reset complete for '${DEMO_ORG_ID}'.`);
  } catch (err) {
    logger.error("[DemoReset] Reset failed:", { message: err.message });
    throw err;
  }
}

export function initializeDemoResetJob() {
  const timezone = process.env.EMAIL_QUEUE_TIMEZONE || process.env.DIGEST_TIMEZONE || "UTC";

  // 3am nightly, same timezone used by the email/digest schedulers.
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        await runDemoResetJob();
      } catch (err) {
        logger.error("[DemoReset] Cron run failed:", { message: err.message });
      }
    },
    { timezone }
  );

  logger.info(`[DemoReset] Nightly reset job registered (3am ${timezone}).`);
}
