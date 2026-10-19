import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import Organization from "./Organization.js";

class CommentTemplate extends Model {}

CommentTemplate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Title cannot be empty" },
        len: { args: [1, 100], msg: "Title must be between 1 and 100 characters" },
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Content cannot be empty" },
      },
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "CommentTemplate",
    tableName: "CommentTemplates",
    timestamps: true,
  }
);

CommentTemplate.belongsTo(Organization, { as: "organization", foreignKey: "organizationId" });
Organization.hasMany(CommentTemplate, { as: "commentTemplates", foreignKey: "organizationId" });

export default CommentTemplate;
