// Issue #561 Phase 1: Integration Jest project. Separate from the backend
// unit suite so unit tests stay fast and avoid Docker / testcontainers.
// Invoked via `npm run test:integration`.
export default {
  testEnvironment: "node",
  globals: { jest: true },
  transform: {},
  rootDir: ".",
  roots: ["<rootDir>/testing/backend-tests-integration"],
  testMatch: ["**/*.test.js"],
  globalSetup: "<rootDir>/testing/test-fixtures/jest-global-setup.js",
  globalTeardown: "<rootDir>/testing/test-fixtures/jest-global-teardown.js",
};
