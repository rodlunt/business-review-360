import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Idea from "./Idea.js";
import Organization from "./Organization.js";

class Comment extends Model {}

Comment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isAdminOnly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notNull: { msg: "Organization ID is required" },
        notEmpty: { msg: "Organization ID cannot be empty" },
      },
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Comment",
    timestamps: true,
  }
);

Comment.belongsTo(User, { as: "author", foreignKey: "authorId" });
User.hasMany(Comment, { as: "comments", foreignKey: "authorId" });
Comment.belongsTo(Idea, { as: "idea", foreignKey: "ideaId" });
Idea.hasMany(Comment, { as: "ideaComments", foreignKey: "ideaId" });
Comment.belongsTo(Organization, { as: "organization", foreignKey: "organizationId" });
Organization.hasMany(Comment, { as: "comments", foreignKey: "organizationId" });

export default Comment;
