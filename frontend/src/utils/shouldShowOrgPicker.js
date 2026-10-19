// Phase 3 Slice 4 (#851): pure decision for whether the org-picker modal
// should show. Extracted from App.jsx for the same reason as selectTour
// (rendering full App OOMs the Vitest worker).
//
// The picker is multi-org only (locked decision #6: single-org users never
// see it) and shows once per login (the `picked` flag is ephemeral session
// state in App.jsx, reset on the user null->set transition, never persisted).
export function shouldShowOrgPicker({ user, memberships, picked }) {
  return !!user && Array.isArray(memberships) && memberships.length > 1 && !picked;
}
