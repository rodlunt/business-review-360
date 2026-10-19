/**
 * EmailLog Model
 *
 * Stores email delivery history for analytics and tracking.
 *
 * Issue #446: Email queue and scheduling system
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class EmailLog extends Model {}

EmailLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "Email template type",
    },
    to: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: "sent",
      validate: {
        isIn: [["sent", "delivered", "bounced", "opened", "clicked", "complained", "failed"]],
      },
    },
    messageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Email provider message ID (Resend, SES, etc.)",
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clickedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    bouncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    bounceType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "soft or hard bounce",
    },
    bounceReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Bounce reason from provider",
    },
    droppedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dropReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    spamReportedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    unsubscribedViaEmailAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Unsubscribed via email link (not in-app)",
    },
    openCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of times opened",
    },
    clickCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of link clicks",
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User agent from open/click events",
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: "IP address from open/click events",
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Additional tracking data",
    },
  },
  {
    sequelize,
    modelName: "EmailLog",
    tableName: "EmailLog",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["organizationId"] },
      { fields: ["type"] },
      { fields: ["status"] },
      { fields: ["sentAt"] },
      { fields: ["messageId"] },
    ],
  }
);

export default EmailLog;
