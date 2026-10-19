// Step-position resume for the three Shepherd onboarding tours. Pure helper
// extracted so App.jsx stays free of decision logic (App.jsx OOMs Vitest --
// see the br360-gotchas skill), following the same pattern as selectTour.js and
// onboardingStep.js.
//
// The server carries the saved step on the user object as
// {superuser,admin,user}WalkthroughStep, set by PATCH /users/walkthrough
// (companion to WALKTHROUGH_STEP_COLUMNS in backend/src/routes/users.js).
// NULL/undefined means no saved position, so onboarding (brand-new user) and
// resume (returning user with a saved position) both funnel through the same
// function: onboarding just returns 0.
const STEP_FIELDS = {
  superuser: "superuserWalkthroughStep",
  admin: "adminWalkthroughStep",
  user: "userWalkthroughStep",
};

export function resumeStep(user, type) {
  const field = STEP_FIELDS[type];
  if (!user || !field) return 0;

  const value = user[field];
  if (!Number.isInteger(value) || value < 0) return 0;

  return value;
}
