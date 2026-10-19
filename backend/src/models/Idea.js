import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Organization from "./Organization.js";

class Idea extends Model {}

Idea.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      index: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
      index: true,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "Reviewing",
      index: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: true,
      index: true,
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      index: true,
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      index: true,
    },
    wouldSpendOwnMoney: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    additionalComments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    orgImpact: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fixImpact: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    solution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    timeSavedMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },
    frequencyCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
      },
    },
    frequencyPeriod: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: {
          args: [["day", "week", "month", "year"]],
          msg: "Frequency period must be one of: day, week, month, year",
        },
      },
    },
    actualTimeSavedMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },
    actualFrequencyCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
      },
    },
    actualFrequencyPeriod: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: {
          args: [["day", "week", "month", "year"]],
          msg: "Actual frequency period must be one of: day, week, month, year",
        },
      },
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      index: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      index: true,
      validate: {
        notNull: { msg: "Organization ID is required" },
        notEmpty: { msg: "Organization ID cannot be empty" },
      },
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      index: true,
    },
    // Priority Matrix & ROI fields (Phase 1 - Advanced Analytics)
    impactScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 5,
      validate: {
        min: 1,
        max: 10,
      },
    },
    effortScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 5,
      validate: {
        min: 1,
        max: 10,
      },
    },
    roiEstimate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    matrixPositionX: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    matrixPositionY: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    implementationCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0,
      },
    },
    isDemoData: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      index: true,
    },
  },
  {
    sequelize,
    modelName: "Idea",
    timestamps: true,
    hooks: {
      beforeValidate: (idea) => {
        if (idea.title && !idea.slug) {
          // Create slug from title + random 5-digit number
          const titleSlug = idea.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 50);
          const randomNum = Math.floor(10000 + Math.random() * 90000);
          idea.slug = `${titleSlug}-${randomNum}`;
        }
      },
    },
  }
);

Idea.belongsTo(User, { as: "author", foreignKey: "authorId" });
User.hasMany(Idea, { as: "ideas", foreignKey: "authorId" });

Idea.belongsTo(Organization, { as: "organization", foreignKey: "organizationId" });
Organization.hasMany(Idea, { as: "ideas", foreignKey: "organizationId" });

export default Idea;
