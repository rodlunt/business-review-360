import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [1, 255],
      },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true, // null for OAuth-only accounts (#0010-add-oauth)
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isAnonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isSuperuser: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Issue #521: personal changelog tracking
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Engagement tracking (Issue #445)
    lastActiveAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last time user was active (for re-engagement emails)",
    },
    lastEngagementEmailSent: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last time a re-engagement email was sent",
    },
    lastSurveySent: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last time a satisfaction survey was sent",
    },
    // Issue #766/#767/#768: per-user walkthrough flags
    hasSeenSuperuserWalkthrough: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hasSeenAdminWalkthrough: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hasSeenUserWalkthrough: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Step-position resume for the three Shepherd tours: NULL means "no
    // saved position, start at step 0". Set on tour cancel (saves the
    // current step), cleared back to NULL on tour complete.
    superuserWalkthroughStep: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    adminWalkthroughStep: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userWalkthroughStep: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Onboarding plan Phase 1: org slug the multi-org picker pre-selects
    // (last choice wins). Same identifier space as organizationId.
    primaryOrganizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Slug of the user's primary org; pre-selected by the multi-org picker",
    },
    // Onboarding plan Phase 1: soft consultant referral attribution captured
    // at registration; reconciled to commission only on later paid conversion.
    referredByConsultantCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: "Consultant referral code entered at signup (soft, unvalidated)",
    },
    referralCapturedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the referral code was captured",
    },
    // Phase 5 follow-up (#892, 2026-05-23, migration 0023): how this User row
    // was created. Captured at User.create; never mutated. Used by platform
    // owner re-engagement / lead-outreach to segment by source.
    signupSource: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment:
        "How this user was created: legacy, invite, demo-signup, oauth-self-register, paid-signup, oauth-no-org, magic-link",
    },
    // Phase 5 follow-up (#892, PR3, migration 0024): the prospect's own
    // company name, captured on demo-signup. Separate from
    // Organization.organizationName (the BR360 tenant they sit in, usually
    // demo-corp). Used by lead outreach.
    companyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "The signup user's own company name (separate from the BR360 tenant org)",
    },
  },
  {
    sequelize,
    modelName: "Users",
    timestamps: true,
    hooks: {
      // Make organizationId immutable after user creation (#400)
      beforeUpdate: (user) => {
        if (user.changed("organizationId") && user._previousDataValues.organizationId !== null) {
          throw new Error("organizationId cannot be changed after user creation");
        }
      },
    },
  }
);

export default User;
