// Phase 3 Slice 2 (#851): pure onboarding-tour selection, extracted from
// App.jsx so it is unit-testable. Rendering the full App in Vitest OOMs the
// worker (see src/__tests__/routes/AppRoutes.test.jsx), so the gate decision
// lives here as a pure function instead.
//
// The gate is the per-user server flags hasSeen{Superuser,Admin,User}
// Walkthrough (delivered on login/register and /auth/me, persisted by the
// tour components' PATCH /users/walkthrough on completion). A missing flag
// (brand-new user, or a demo token which has no DB row) reads as falsy and
// shows the tour, which is the intended behaviour. Role precedence is
// unchanged from the previous localStorage gate: superuser, then admin
// (non-superuser), then a plain non-anonymous user.
//
// Returns "superuser" | "admin" | "user" | null.
export function selectTour(user) {
  if (!user) return null;
  if (user.isSuperuser && !user.hasSeenSuperuserWalkthrough) return "superuser";
  if (user.isAdmin && !user.isSuperuser && !user.hasSeenAdminWalkthrough) return "admin";
  if (!user.isAdmin && !user.isAnonymous && !user.hasSeenUserWalkthrough) return "user";
  return null;
}
