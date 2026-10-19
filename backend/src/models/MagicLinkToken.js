import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

/**
 * MagicLinkToken Model
 *
 * #892: server-side single-use consumed-record for magic-link guest
 * access. The bearer token itself is a short-lived (15 min), purpose-bound
 * HS256 JWT (payload: { email, purpose: 'magic-link' }, jti claim) minted
 * by POST /api/auth/magic-link -- the same purpose-bound-JWT family as the
 * existing org-pick token (routes/auth.js /org-switch/token, /select-org).
 *
 * A JWT alone is not single-use, so this table is the consumed-record the
 * redeem handler checks against, keyed by jti rather than by userId: no
 * User row is guaranteed to exist yet for the email at send time (redeem
 * creates one if missing), so the reset-password pattern of storing the
 * token on the Users row (passwordResetToken/passwordResetExpires) does
 * not apply here. See migration 0029-add-magic-link-tokens.sql.
 */
class MagicLinkToken extends Model {}

MagicLinkToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    jti: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "MagicLinkToken",
    tableName: "MagicLinkTokens",
    timestamps: true,
    indexes: [{ fields: ["email"] }],
  }
);

export default MagicLinkToken;
