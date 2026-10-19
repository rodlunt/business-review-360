import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class Organization extends Model {}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: false,
    },
    organizationName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    organizationDescription: {
      type: DataTypes.TEXT,
    },
    primaryColor: {
      type: DataTypes.STRING(7),
      defaultValue: "#1565c0", // Marketing website primary color
    },
    logoUrl: {
      type: DataTypes.STRING(500),
    },
    logoHighContrast: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    bigQuestion: {
      type: DataTypes.TEXT,
    },
    useCaptcha: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    allowAnonymousIdeas: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    requireApproval: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    maxIdeasPerUser: {
      type: DataTypes.INTEGER,
    },
    enablePwaPrompt: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allowSelfRegistration: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    domainRestrictionMode: {
      type: DataTypes.ENUM("none", "whitelist", "blacklist"),
      defaultValue: "none",
    },
    allowedDomains: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    blockedDomains: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    demoDataLoaded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    demoDataLoadedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    setupWizardCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    setupWizardStep: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    // AI integration fields (issue #721)
    aiMode: {
      type: DataTypes.STRING(20),
      defaultValue: "disabled",
    },
    aiProvider: {
      type: DataTypes.STRING(30),
    },
    aiApiKeyEncrypted: {
      type: DataTypes.TEXT,
    },
    // OAuth social login + enterprise SSO (#0010-add-oauth)
    oauthGoogleEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    oauthGithubEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    oauthMicrosoftEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    ssoAzureEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    ssoAzureTenantId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    ssoAllowedDomains: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    oauthAutoSuperuser: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Consultant referral tracking (#808 Phase 2)
    referredBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: "Organization",
    tableName: "Organizations",
    timestamps: true,
  }
);

export default Organization;
