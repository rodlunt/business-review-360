/**
 * Template rendering utility for HTML reports.
 * Maps board report data to the HTML template.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(value);
}

function getPeriodLabel(period, startDate, endDate) {
  if (period === "custom") {
    return `${formatDate(startDate)} to ${formatDate(endDate)}`;
  }
  const labels = {
    month: "This Month",
    "last-month": "Last Month",
    quarter: "This Quarter",
    year: "This Year",
    "last-year": "Last Year",
    ytd: "Year to Date",
    q1: "Q1",
    q2: "Q2",
    q3: "Q3",
    q4: "Q4",
  };
  return labels[period] || period;
}

function getStatusClass(status) {
  if (!status) return "complete";
  if (status.includes("Reviewing") || status.includes("Review")) return "reviewing";
  if (status.includes("Approved")) return "approved";
  if (status.includes("In Progress")) return "in-progress";
  if (status.includes("Complete") || status.includes("Completed")) return "complete";
  return "complete";
}

function getTrendText(trend) {
  if (!trend || trend.pct === null) return "";
  const dir =
    trend.direction === "up" ? "&#8593;" : trend.direction === "down" ? "&#8595;" : "&#8594;";
  return `${dir} ${Math.abs(trend.pct)}% vs prior`;
}

function getTrendClass(trend) {
  if (!trend || trend.pct === null) return "flat";
  return trend.direction || "flat";
}

function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DEFAULT_PRIMARY = "#1565c0";

export function renderBoardReport(data) {
  const templatePath = path.join(__dirname, "../views/board-report.html");
  let html = fs.readFileSync(templatePath, "utf8");

  // Data extraction
  const {
    meta = {},
    executiveSummary = {},
    roiImpact = {},
    topIdeas = [],
    pipeline = {},
    stuckCount = 0,
    recommendations = [],
  } = data;

  const rawOrg = meta.organization || {};
  // Validate primaryColor before it lands in a CSS <style> block; escapeHtml does not
  // cover CSS injection (no HTML special chars needed to break out of a CSS value).
  const org = {
    ...rawOrg,
    primaryColor: HEX_COLOR_RE.test(rawOrg.primaryColor) ? rawOrg.primaryColor : DEFAULT_PRIMARY,
  };
  const period = meta.period || "quarter";
  const start = meta.start ? formatDate(meta.start) : "";
  const end = meta.end ? formatDate(meta.end) : "";
  const dateRange = `${start} – ${end}`;
  const generatedAt = formatDate(meta.generatedAt || new Date());
  const hourlyRate = meta.hourlyRate || 30;

  // Helper to get nested value from context
  const getValue = (path) => {
    const parts = path.split(".");
    let val = {
      org,
      periodLabel: getPeriodLabel(period, meta.start, meta.end),
      dateRange,
      generatedAt,
      totalIdeas: executiveSummary.totalIdeas || {},
      implemented: executiveSummary.implemented || {},
      activeUsers: executiveSummary.activeUsers || {},
      participationRate: executiveSummary.participationRate || 0,
      totalUsers: executiveSummary.totalUsers || 0,
      avgTimeToImplementation: Math.round(executiveSummary.avgTimeToImplementation || 0),
      annualCostSavings: formatCurrency(roiImpact.annualCostSavings || 0),
      annualTimeSavedHours: Math.round(roiImpact.annualTimeSavedHours || 0),
      costPerIdea: formatCurrency(roiImpact.costPerIdea || 0),
      ideasImplemented: roiImpact.ideasImplemented || 0,
      hourlyRate,
      pipeline,
      stuckCount,
    };

    for (const part of parts) {
      val = val?.[part];
    }
    return val;
  };

  // Step 1: Replace {{#if}} conditionals first
  html = html.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, condition, content) => {
      const value = getValue(condition);
      return value ? content : "";
    }
  );

  // Step 2: Replace {{#each topIdeas}} loops
  html = html.replace(/\{\{#each\s+topIdeas\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, content) => {
    if (!topIdeas || topIdeas.length === 0) return "";
    return topIdeas
      .map((item, index) => {
        const enriched = { ...item, rank: index + 1 };
        let itemHtml = content;
        itemHtml = itemHtml.replace(/\{\{this\.(\w+)\}\}/g, (m, prop) => {
          const value = enriched[prop];
          return value !== undefined ? escapeHtml(String(value)) : "";
        });
        itemHtml = itemHtml.replace(/\{\{statusClass\s+this\.(\w+)\}\}/g, (m, prop) => {
          return getStatusClass(enriched[prop]);
        });
        itemHtml = itemHtml.replace(
          /\{\{#if\s+this\.(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
          (m, prop, inner) => {
            return enriched[prop] ? inner : "";
          }
        );
        return itemHtml;
      })
      .join("");
  });

  // Step 3: Replace {{#each recommendations}} loops
  html = html.replace(
    /\{\{#each\s+recommendations\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (match, content) => {
      if (!recommendations || recommendations.length === 0) return "";
      return recommendations
        .map((item, index) => {
          const enriched = { ...item, rank: index + 1 };
          let itemHtml = content;
          itemHtml = itemHtml.replace(/\{\{this\.(\w+)\}\}/g, (m, prop) => {
            const value = enriched[prop];
            return value !== undefined ? escapeHtml(String(value)) : "";
          });
          itemHtml = itemHtml.replace(/\{\{statusClass\s+this\.(\w+)\}\}/g, (m, prop) => {
            return getStatusClass(enriched[prop]);
          });
          itemHtml = itemHtml.replace(
            /\{\{#if\s+this\.(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
            (m, prop, inner) => {
              return enriched[prop] ? inner : "";
            }
          );
          return itemHtml;
        })
        .join("");
    }
  );

  // Step 4: Replace {{trendText variableName}}
  html = html.replace(/\{\{trendText\s+([\w.]+)\}\}/g, (match, varName) => {
    const trend = getValue(varName);
    return getTrendText(trend);
  });

  // Step 4b: Replace {{trendClass variableName}}
  html = html.replace(/\{\{trendClass\s+([\w.]+)\}\}/g, (match, varName) => {
    const trend = getValue(varName);
    return getTrendClass(trend);
  });

  // Step 5: Replace {{statusClass variableName}}
  html = html.replace(/\{\{statusClass\s+([\w.]+)\}\}/g, (match, varName) => {
    const value = getValue(varName);
    return getStatusClass(value);
  });

  // Step 6: Replace all remaining {{variable}} or {{object.property}} patterns
  html = html.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
    const value = getValue(key);
    if (value === undefined || value === null) return "";
    return escapeHtml(String(value));
  });

  return html;
}
