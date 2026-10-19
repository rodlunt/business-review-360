import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Comment from "./Comment.js";
import Organization from "./Organization.js";

class CommentVote extends Model {}

CommentVote.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 1 }, // Only upvotes for now
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
    modelName: "CommentVote",
    timestamps: true,
  }
);

CommentVote.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(CommentVote, { as: "commentVotes", foreignKey: "userId" });
CommentVote.belongsTo(Comment, { as: "comment", foreignKey: "commentId" });
Comment.hasMany(CommentVote, { as: "votes", foreignKey: "commentId" });
CommentVote.belongsTo(Organization, { as: "organization", foreignKey: "organizationId" });
Organization.hasMany(CommentVote, { as: "commentVotes", foreignKey: "organizationId" });

export default CommentVote;
