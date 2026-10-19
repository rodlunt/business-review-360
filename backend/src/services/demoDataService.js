// Issue #527: Load / remove demo data for a tenant.
//
// Demo ideas are tagged with isDemoData=true so they are excluded from plan
// limits, clearly visible as sample content, and removed as a unit.

import { sequelize } from "../models/database.js";
import Idea from "../models/Idea.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";
import Organization from "../models/Organization.js";
import { QueryTypes } from "sequelize";

const DEMO_IDEAS = [
  {
    title: "[DEMO] Automate monthly performance reports",
    description:
      "Our team spends two days each month manually compiling KPI data from multiple systems into a spreadsheet. Automating this process would free up significant time and reduce errors.",
    category: "Technology",
    status: "In Progress",
    priority: 3,
    solution: "Integrate our data sources via API and schedule automated report generation.",
    orgImpact: "Saves approximately 16 person-hours per month across the team.",
    timeSavedMinutes: 120,
    frequencyCount: 1,
    frequencyPeriod: "month",
    impactScore: 8,
    effortScore: 5,
  },
  {
    title: "[DEMO] Introduce flexible working hours",
    description:
      "Allowing team members to flex their start and finish times within a two-hour window would improve work-life balance and reduce peak-hour commute stress.",
    category: "People & Culture",
    status: "Complete",
    priority: 2,
    orgImpact: "Improves staff retention and reduces absenteeism.",
    impactScore: 7,
    effortScore: 3,
  },
  {
    title: "[DEMO] Improve customer onboarding experience",
    description:
      "New customers frequently contact support in their first week with questions that a better onboarding flow would answer. A guided setup wizard and welcome email sequence would reduce these contacts significantly.",
    category: "Customer Experience",
    status: "Approved",
    priority: 1,
    solution: "Build a step-by-step onboarding checklist and automate a 3-email welcome sequence.",
    orgImpact: "Estimated 30% reduction in first-week support tickets.",
    impactScore: 9,
    effortScore: 6,
  },
  {
    title: "[DEMO] Streamline expense approval workflow",
    description:
      "Expense claims currently require physical forms, manual manager signatures, and a two-week processing cycle. Moving to a digital approval workflow would cut processing time to two business days.",
    category: "Process Improvement",
    status: "Reviewing",
    priority: 4,
    timeSavedMinutes: 45,
    frequencyCount: 1,
    frequencyPeriod: "week",
    impactScore: 6,
    effortScore: 4,
  },
  {
    title: "[DEMO] Weekly cross-department knowledge sharing sessions",
    description:
      "Teams operate in silos and are often unaware of what other departments are working on. A short weekly session where each team shares one insight or lesson learned would improve collaboration.",
    category: "People & Culture",
    status: "Reviewing",
    priority: 5,
    orgImpact: "Reduces duplicated effort and surfaces cross-team opportunities.",
    impactScore: 6,
    effortScore: 2,
  },
  {
    title: "[DEMO] Self-service FAQ for common IT issues",
    description:
      "The IT helpdesk receives the same ten questions every week. A searchable internal FAQ covering password resets, VPN setup, and printer troubleshooting would cut ticket volume substantially.",
    category: "Technology",
    status: "In Progress",
    priority: 3,
    solution: "Create a Confluence or Notion page and link it from the helpdesk portal.",
    timeSavedMinutes: 30,
    frequencyCount: 5,
    frequencyPeriod: "week",
    impactScore: 7,
    effortScore: 2,
  },
  {
    title: "[DEMO] Upgrade project management tooling",
    description:
      "We are currently tracking projects across email threads, shared spreadsheets, and a basic task board. Consolidating onto a single project management platform would give everyone visibility and reduce missed deadlines.",
    category: "Technology",
    status: "Reviewing",
    priority: 4,
    solution: "Evaluate three tools against our requirements and pilot with one team for 30 days.",
    impactScore: 7,
    effortScore: 5,
  },
  {
    title: "[DEMO] Reduce packaging waste in outbound shipping",
    description:
      "We are using oversized boxes with excessive void fill for many small orders. Right-sizing our packaging choices would lower material costs and reduce our environmental footprint.",
    category: "Operations",
    status: "Approved",
    priority: 2,
    orgImpact:
      "Estimated 20% reduction in packaging spend and measurable sustainability improvement.",
    impactScore: 6,
    effortScore: 3,
  },
  {
    title: "[DEMO] Quarterly customer satisfaction survey",
    description:
      "We have no systematic way to measure how happy customers are between contract renewals. A short quarterly NPS survey would give us early warning of at-risk accounts.",
    category: "Customer Experience",
    status: "Complete",
    priority: 1,
    solution: "Use an existing survey tool and automate distribution via our email platform.",
    orgImpact: "Identifies at-risk accounts before they churn.",
    impactScore: 8,
    effortScore: 2,
  },
  {
    title: "[DEMO] Standardise meeting agendas and follow-ups",
    description:
      "Meetings often run over time, lack clear outcomes, and produce no written follow-up. A simple template for agendas and a five-minute end-of-meeting action capture would significantly improve meeting effectiveness.",
    category: "Process Improvement",
    status: "Reviewing",
    priority: 5,
    orgImpact: "Reduces meeting time waste and improves accountability for action items.",
    timeSavedMinutes: 20,
    frequencyCount: 3,
    frequencyPeriod: "week",
    impactScore: 5,
    effortScore: 1,
  },
];

const DEMO_COMMENTS = {
  "[DEMO] Automate monthly performance reports":
    "Great idea. I have already spoken with IT and they confirmed an API integration is feasible. Moving to planning phase.",
  "[DEMO] Improve customer onboarding experience":
    "Support team data backs this up. We logged 47 first-week contact tickets last month and 38 were questions a better onboarding flow would have answered.",
  "[DEMO] Self-service FAQ for common IT issues":
    "I will draft the top-ten FAQ entries by end of week and share for review before publishing.",
  "[DEMO] Quarterly customer satisfaction survey":
    "Implemented last quarter. NPS score is now tracked monthly. Three at-risk accounts identified and retained so far.",
  "[DEMO] Streamline expense approval workflow":
    "Finance has flagged this as a priority. Would be good to include them in the scoping conversation.",
};

export async function loadDemoData({ tenantId, organizationId, adminUserId }) {
  const t = await sequelize.transaction();
  try {
    const ideas = await Promise.all(
      DEMO_IDEAS.map((data) =>
        Idea.create(
          { ...data, isDemoData: true, organizationId, tenant_id: tenantId, authorId: adminUserId },
          { transaction: t }
        )
      )
    );

    // Admin comments on selected ideas
    await Promise.all(
      ideas
        .filter((idea) => DEMO_COMMENTS[idea.title])
        .map((idea) =>
          Comment.create(
            {
              content: DEMO_COMMENTS[idea.title],
              isAdminOnly: false,
              organizationId,
              tenant_id: tenantId,
              authorId: adminUserId,
              ideaId: idea.id,
            },
            { transaction: t }
          )
        )
    );

    // One upvote per idea from the admin user
    await Promise.all(
      ideas.map((idea) =>
        Vote.create(
          { value: 1, userId: adminUserId, ideaId: idea.id, tenant_id: tenantId },
          { transaction: t }
        )
      )
    );

    await Organization.update(
      { demoDataLoaded: true, demoDataLoadedAt: new Date() },
      { where: { organizationId }, transaction: t }
    );

    await t.commit();
    return { ideaCount: ideas.length };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

export async function removeDemoData({ tenantId, organizationId }) {
  const t = await sequelize.transaction();
  try {
    // Find demo idea ids for this tenant
    const demoIdeas = await sequelize.query(
      'SELECT id FROM "Ideas" WHERE tenant_id = :tenantId AND "isDemoData" = true',
      { replacements: { tenantId }, type: QueryTypes.SELECT, transaction: t }
    );
    const ideaIds = demoIdeas.map((r) => r.id);

    if (ideaIds.length > 0) {
      // Delete votes on demo ideas
      await sequelize.query(
        `DELETE FROM "Votes" WHERE "ideaId" IN (:ideaIds) AND tenant_id = :tenantId`,
        { replacements: { ideaIds, tenantId }, type: QueryTypes.DELETE, transaction: t }
      );

      // Delete comments on demo ideas
      await sequelize.query(
        `DELETE FROM "Comments" WHERE "ideaId" IN (:ideaIds) AND tenant_id = :tenantId`,
        { replacements: { ideaIds, tenantId }, type: QueryTypes.DELETE, transaction: t }
      );

      // Delete the demo ideas
      await sequelize.query(
        `DELETE FROM "Ideas" WHERE id IN (:ideaIds) AND tenant_id = :tenantId`,
        { replacements: { ideaIds, tenantId }, type: QueryTypes.DELETE, transaction: t }
      );
    }

    await Organization.update(
      { demoDataLoaded: false, demoDataLoadedAt: null },
      { where: { organizationId }, transaction: t }
    );

    await t.commit();
    return { removedCount: ideaIds.length };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}
