/**
 * The canonical idea-status vocabulary, in ONE place (#951 review follow-up).
 *
 * Before this module, three independently maintained lists existed
 * (STATUS_MAPPING in analyticsService, KNOWN/PIPELINE/COMPLETE lists in
 * boardReportService, allStatuses in OverviewTab.jsx) and drift between
 * them silently re-created the #951 class: an idea visible on chips but
 * missing from aggregates. Backend consumers must derive from here; the
 * frontend's display list is drift-proofed separately (OverviewTab appends
 * any status the API returns that its list does not know).
 *
 * Keys are every status string the database has legitimately held (current
 * plus legacy aliases); values are the canonical display status each maps
 * to. A status absent from this map is out of vocabulary and must surface
 * as "Other", never be dropped.
 */
export const STATUS_MAPPING = {
  Reviewing: "Reviewing",
  "Under Review": "Reviewing",
  "In Progress": "In Progress",
  Approved: "Approved",
  "Approved - In Progress": "In Progress",
  Complete: "Complete",
  "Closed - Completed": "Complete",
  Rejected: "Rejected",
  "Closed - Rejected": "Rejected",
  Duplicate: "Duplicate",
  Hidden: "Hidden",
  Open: "Open",
};

/** Raw status strings that count as implemented/complete. */
export const COMPLETE_STATUSES = Object.keys(STATUS_MAPPING).filter(
  (raw) => STATUS_MAPPING[raw] === "Complete"
);

/** Raw status strings that appear in the board report's pipeline funnel. */
export const PIPELINE_STATUSES = Object.keys(STATUS_MAPPING).filter((raw) =>
  ["Reviewing", "Approved", "In Progress", "Complete"].includes(STATUS_MAPPING[raw])
);
