/**
 * AI Adapter factory (issue #721).
 *
 * resolveProvider(organizationId) returns an AIProvider instance for the
 * given tenant, routing to BYO or managed credentials based on the
 * organisation's aiMode + aiProvider settings.
 *
 * Encryption: BYO keys are stored as AES-256-GCM ciphertext in
 * Organization.aiApiKeyEncrypted. The encryption key is AI_ENCRYPTION_KEY
 * (32-byte hex). If the env var is absent, BYO mode is unavailable.
 */

import crypto from "crypto";
import Organization from "../../models/Organization.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { logger } from "../../utils/logger.js";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.AI_ENCRYPTION_KEY;

function encryptionKey() {
  if (!KEY_HEX) throw new Error("AI_ENCRYPTION_KEY is not set");
  const key = Buffer.from(KEY_HEX, "hex");
  if (key.length !== 32) throw new Error("AI_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return key;
}

export function encryptApiKey(plaintext) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptApiKey(ciphertext) {
  const key = encryptionKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, undefined, "utf8") + decipher.final("utf8");
}

function buildProvider(providerName, apiKey) {
  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
    default:
      throw new Error(`Unknown AI provider "${providerName}"`);
  }
}

/**
 * Resolve an AIProvider for the given organization.
 *
 * @param {string} organizationId - the org slug
 * @returns {Promise<import('./interface.js').AIProvider>}
 * @throws if AI is disabled for the org, or credentials are missing
 */
export async function resolveProvider(organizationId) {
  const org = await Organization.findOne({
    where: { organizationId },
    attributes: ["aiMode", "aiProvider", "aiApiKeyEncrypted"],
  });

  if (!org || !org.aiMode || org.aiMode === "disabled") {
    throw new Error("AI features are not enabled for this organisation");
  }

  if (org.aiMode === "byo") {
    if (!org.aiApiKeyEncrypted) {
      throw new Error("BYO API key is not configured");
    }
    const apiKey = decryptApiKey(org.aiApiKeyEncrypted);
    logger.info(`[AIAdapter] Using BYO ${org.aiProvider} key for org ${organizationId}`);
    return buildProvider(org.aiProvider, apiKey);
  }

  if (org.aiMode === "managed") {
    const managedKey = process.env.BR360_AI_API_KEY;
    if (!managedKey) {
      throw new Error("Managed AI is not configured on this deployment");
    }
    const managedProvider = process.env.BR360_AI_PROVIDER || "anthropic";
    logger.info(`[AIAdapter] Using managed ${managedProvider} key for org ${organizationId}`);
    return buildProvider(managedProvider, managedKey);
  }

  throw new Error(`Unknown aiMode "${org.aiMode}"`);
}
