import { shouldShowOrgPicker } from "./shouldShowOrgPicker";
import { selectTour } from "./selectTour";

// Phase 3 Slice 5 (#851): the single ordered post-auth onboarding decision,
// replacing the previously independent racing effects (Slice 2 tour gate +
// Slice 4 org-picker guard). Extracted as a pure function for the same reason
// as selectTour / shouldShowOrgPicker: rendering full App OOMs the Vitest
// worker.
//
// Order: org-pick (multi-org, every login) -> welcome (every login) -> role
// tour (first login, per the hasSeen*Walkthrough server flag) -> done.
//
//   - orgPicked   : ephemeral, re-armed on the user id change (a fresh login),
//                   stable across an in-place org switch (Slice 4).
//   - welcomeSeen : ephemeral, re-armed on every login. The welcome modal is
//                   intentionally shown every login with no persistence and no
//                   dismiss-forever (locked decision #7).
//
// Returns "orgPicker" | "welcome" | "tour" | "done".
export function nextOnboardingStep({ user, memberships, orgPicked, welcomeSeen }) {
  if (!user) return "done";
  if (shouldShowOrgPicker({ user, memberships, picked: orgPicked })) return "orgPicker";
  if (!welcomeSeen) return "welcome";
  if (selectTour(user)) return "tour";
  return "done";
}
