/**
 * AIInsightsService: generate AI commentary on analytics dashboard KPIs.
 *
 * Issue #730. Calls the AI adapter from #721 with a structured prompt
 * derived from the existing analytics summary. The insight generation is
 * explicit (user-triggered), not automatic, to avoid burning tokens on
 * every page load.
 *
 * ctx shape: { organizationId, organizationName }
 */

import { getDashboardAnalytics } from "./analyticsService.js";
import { resolveProvider } from "../adapters/ai/index.js";

const SYSTEM_PROMPT = `You are a concise business analytics advisor for BR360, a continuous improvement platform that collects and tracks ideas from employees. Analyse the provided organisation metrics and write a brief, professional commentary.

Rules:
- 3-4 sentences total. No more.
- Write in flowing prose, no bullet points or headers.
- Be specific about the numbers -- reference them directly.
- End with one concrete, actionable suggestion the admin can act on this week.
- Australian English spelling (organisation, analyse, recognise).
- No em-dashes or en-dashes. Use a comma or full stop instead.
- Never mention yourself or the AI. Write as if you are a human advisor.`;

function describeTrend(trend) {
  if (!trend || trend.pct === null) return "unchanged";
  const dir = trend.direction === "up" ? "up" : trend.direction === "down" ? "down" : "flat";
  return `${dir} ${Math.abs(trend.pct)}% vs prior period`;
}

function detectNotableMovements(summary) {
  const flags = [];
  const { trends } = summary;

  if (trends?.totalIdeas?.pct !== null && Math.abs(trends.totalIdeas.pct ?? 0) >= 40) {
    flags.push({
      kpi: "Idea submissions",
      direction: trends.totalIdeas.direction,
      pct: trends.totalIdeas.pct,
    });
  }
  if (trends?.activeUsers?.pct !== null && Math.abs(trends.activeUsers.pct ?? 0) >= 40) {
    flags.push({
      kpi: "Active users",
      direction: trends.activeUsers.direction,
      pct: trends.activeUsers.pct,
    });
  }
  if (summary.ideasNeedingAttention >= 5) {
    flags.push({
      kpi: "Ideas stuck in review",
      direction: "up",
      pct: null,
      note: `${summary.ideasNeedingAttention} ideas in Reviewing >14 days`,
    });
  }
  const participationRate =
    summary.totalUsers > 0 ? Math.round((summary.activeUsers / summary.totalUsers) * 100) : 0;
  if (participationRate < 30) {
    flags.push({
      kpi: "Participation rate",
      direction: "down",
      pct: null,
      note: `${participationRate}% of users active`,
    });
  }

  return flags;
}

export async function generateAnalyticsInsights({ organizationId, organizationName }) {
  const provider = await resolveProvider(organizationId);
  const analytics = await getDashboardAnalytics({ organizationId });
  const { summary } = analytics;

  const participationRate =
    summary.totalUsers > 0 ? Math.round((summary.activeUsers / summary.totalUsers) * 100) : 0;

  const notableMovements = detectNotableMovements(summary);

  const safeOrgName = (organizationName || organizationId).replace(/[\r\n]/g, " ").slice(0, 100);

  const userMessage = [
    `Analytics snapshot for ${safeOrgName}:`,
    "",
    `- Total ideas: ${summary.totalIdeas} (submissions ${describeTrend(summary.trends?.totalIdeas)})`,
    `- Active users: ${summary.activeUsers} of ${summary.totalUsers} (${participationRate}% participation; ${describeTrend(summary.trends?.activeUsers)})`,
    `- Completion rate: ${summary.completionRate}%`,
    `- Avg time to implementation: ${summary.avgTimeToResolution} days`,
    `- Ideas stuck in review (>14 days): ${summary.ideasNeedingAttention}`,
    `- Annual time savings (actual, implemented ideas): ${summary.actualAnnualSavings?.hours ?? 0} hours`,
    `- Potential annual savings (pipeline): ${summary.potentialAnnualSavings?.hours ?? 0} hours`,
    notableMovements.length > 0
      ? `\nNotable movements: ${notableMovements.map((f) => f.note ?? `${f.kpi} ${f.direction} ${Math.abs(f.pct)}%`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await provider.complete({
    messages: [{ role: "user", content: userMessage }],
    system: SYSTEM_PROMPT,
    maxTokens: 200,
  });

  if (!result.content) {
    throw new Error("AI provider returned empty response");
  }

  return {
    commentary: result.content,
    notableMovements,
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    usage: result.usage,
  };
}
