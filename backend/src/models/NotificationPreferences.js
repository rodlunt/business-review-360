import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";

class NotificationPreferences extends Model {}

NotificationPreferences.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "Users",
        key: "id",
      },
      onDelete: "CASCADE",
    },

    // Global frequency setting
    emailFrequency: {
      type: DataTypes.ENUM("realtime", "hourly", "daily", "weekly", "off"),
      defaultValue: "realtime",
      comment: "How often to send non-critical emails",
    },

    // User notification toggles
    commentsOnIdeas: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Notify when someone comments on my ideas",
    },
    repliesToComments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Notify when someone replies to my comments",
    },
    statusChanges: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Notify when my idea status changes",
    },
    ideaImplemented: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Notify when my idea is implemented",
    },
    newIdeas: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Notify about new ideas in organization (can be overwhelming)",
    },
    weeklySummary: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Receive weekly activity summary",
    },
    monthlyReports: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Receive monthly organization reports",
    },
    engagementEmails: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Receive tips and engagement emails",
    },

    // Admin-only notification toggles
    adminNewIdeas: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Admin: Notify when new ideas are submitted",
    },
    adminNewIdeasFrequency: {
      type: DataTypes.ENUM("realtime", "hourly", "daily", "weekly"),
      defaultValue: "realtime",
      comment: "Admin: How often to receive new idea notifications",
    },
    adminNeedsAttention: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Admin: Receive weekly digest of stale ideas",
    },
    adminMonthlySummary: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Admin: Receive monthly admin summary",
    },

    // Global unsubscribe (only critical emails like password reset allowed)
    globalUnsubscribe: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Unsubscribe from all non-critical emails",
    },
  },
  {
    sequelize,
    modelName: "NotificationPreferences",
    tableName: "NotificationPreferences",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["userId"],
      },
    ],
  }
);

// Associations
NotificationPreferences.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasOne(NotificationPreferences, { as: "notificationPreferences", foreignKey: "userId" });

export default NotificationPreferences;
