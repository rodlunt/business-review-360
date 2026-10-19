/**
 * EmailAnalytics Model
 *
 * Stores aggregated email analytics for performance tracking.
 * Data is aggregated daily from EmailLog.
 *
 * Issue #448: Email analytics and monitoring dashboard
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class EmailAnalytics extends Model {
  /**
   * Calculate derived metrics
   */
  getMetrics() {
    const sent = this.sent || 0;
    const delivered = this.delivered || 0;
    const opened = this.opened || 0;
    const clicked = this.clicked || 0;
    const bounced = this.bounced || 0;
    const spamReported = this.spamReported || 0;
    const unsubscribed = this.unsubscribed || 0;

    return {
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickThroughRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      clickToOpenRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      spamRate: delivered > 0 ? (spamReported / delivered) * 100 : 0,
      unsubscribeRate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0,
      engagementRate: delivered > 0 ? ((opened + clicked) / (delivered * 2)) * 100 : 0,
    };
  }
}

EmailAnalytics.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Organization this analytics belongs to (null for global)",
    },
    emailType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Email template type (null for all types)",
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Date of the analytics",
    },
    // Counts
    sent: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of emails sent",
    },
    delivered: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of emails delivered",
    },
    opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of emails opened",
    },
    uniqueOpens: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of unique opens (one per email)",
    },
    clicked: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of link clicks",
    },
    uniqueClicks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of unique clicks (one per email)",
    },
    bounced: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of bounces",
    },
    softBounced: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of soft bounces",
    },
    hardBounced: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of hard bounces",
    },
    dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of dropped emails",
    },
    spamReported: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of spam reports",
    },
    unsubscribed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of unsubscribes via email",
    },
  },
  {
    sequelize,
    modelName: "EmailAnalytics",
    tableName: "EmailAnalytics",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["organizationId", "emailType", "date"],
        name: "unique_org_type_date",
      },
      { fields: ["organizationId", "date"] },
      { fields: ["emailType"] },
      { fields: ["date"] },
    ],
  }
);

export default EmailAnalytics;
