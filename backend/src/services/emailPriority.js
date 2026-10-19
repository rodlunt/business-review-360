// Email priority constants.
//
// Lives in its own leaf module so callers (e.g. userService.js) can import
// the enum without dragging in `emailQueueService.js` and the full Sequelize
// model association graph - which would break any Jest test that mocks
// individual models (the "Idea.belongsTo called with something that's not a
// subclass of Sequelize.Model" failure documented in the br360-gotchas skill and the
// project memory `project_leaf_service_sequelize_import`).
//
// `emailQueueService.js` re-exports this so the public queue API surface is
// unchanged.

export const EmailPriority = {
  CRITICAL: 1, // Password resets, security alerts
  HIGH: 3, // Status changes, implementations
  NORMAL: 5, // Default
  LOW: 7, // New idea notifications
  BATCH: 9, // Digests, summaries, bulk staff invites (#865)
};
