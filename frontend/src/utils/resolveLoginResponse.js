// Phase 5 Slice 5b (#866): pure classification of a POST /auth/login
// response body. Extracted as a pure function for the same reason as
// selectTour / shouldShowOrgPicker / onboardingStep: the org-less login
// wiring lands in App.jsx, and rendering the full App OOMs the Vitest
// worker (see src/__tests__/routes/AppRoutes.test.jsx). The decision
// therefore lives here and is unit-tested in isolation.
//
// The org-optional /auth/login (5a, #858; see backend auth.js) returns
// one of two successful shapes:
//
//   - authed: { token, user }. A session was minted (org-scoped login,
//     OR org-less login that resolved to a single approved org). user
//     carries organizationId. Behaviour is identical to the legacy
//     org-scoped response.
//   - pick:   { pickToken, multiOrg: true, primaryOrganizationId,
//     memberships: [{ organizationId, orgName, isAdmin, isSuperuser }] }.
//     The email resolved to >1 approved org. NO session yet; the
//     caller renders the picker from this inline payload and exchanges
//     pickToken via the existing public POST /auth/select-org.
//
// A 401 (invalid credentials / locked / no approved membership / split
// identity) is an axios rejection and never reaches this resolver; it
// only classifies a 200 body. An unrecognised body is reported as
// 'unknown' rather than silently treated as authed, so the caller fails
// closed instead of setting a half-formed session.
//
// Returns one of:
//   { kind: "authed", user }
//   { kind: "pick", pickToken, memberships, primaryOrganizationId }
//   { kind: "unknown" }
export function resolveLoginResponse(data) {
  if (data && data.token && data.user) {
    return { kind: "authed", user: data.user };
  }
  if (data && data.multiOrg === true && data.pickToken) {
    return {
      kind: "pick",
      pickToken: data.pickToken,
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
      primaryOrganizationId: data.primaryOrganizationId ?? null,
    };
  }
  return { kind: "unknown" };
}
