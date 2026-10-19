/**
 * AIProvider: abstract base for all AI provider implementations.
 *
 * Issue #721. Keeps the provider swap surface to a single module:
 * swap Anthropic for OpenAI (or a self-hosted model) via config,
 * not a rewrite.
 *
 * @typedef {Object} Message
 * @property {'user'|'assistant'} role
 * @property {string} content
 *
 * @typedef {Object} CompletionResult
 * @property {string} content     - The model's text response
 * @property {Object} usage       - Token usage
 * @property {number} usage.inputTokens
 * @property {number} usage.outputTokens
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string} [error]
 */

export class AIProvider {
  /**
   * Send a chat completion request.
   *
   * @param {Object} opts
   * @param {Message[]} opts.messages
   * @param {string}    [opts.system]     System prompt
   * @param {string}    [opts.model]      Provider-specific model ID override
   * @param {number}    [opts.maxTokens]  Maximum tokens in response
   * @returns {Promise<CompletionResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async complete({ messages, system, model, maxTokens }) {
    throw new Error("AIProvider.complete() must be implemented by subclass");
  }

  /**
   * Verify the credentials are valid without consuming significant quota.
   *
   * @returns {Promise<ValidationResult>}
   */
  async validate() {
    throw new Error("AIProvider.validate() must be implemented by subclass");
  }

  /**
   * Provider identifier string for logging/telemetry.
   *
   * @returns {string}
   */
  get name() {
    throw new Error("AIProvider.name must be implemented by subclass");
  }
}

export default AIProvider;
