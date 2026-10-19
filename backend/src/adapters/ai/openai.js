import { AIProvider } from "./interface.js";

/**
 * OpenAI provider stub -- not yet implemented.
 * Extend this when OpenAI support is needed under #721.
 */
export class OpenAIProvider extends AIProvider {
  constructor(_apiKey) {
    super();
  }

  get name() {
    return "openai";
  }

  async complete(_opts) {
    throw new Error("OpenAI provider is not yet implemented");
  }

  async validate() {
    return { valid: false, error: "OpenAI provider is not yet implemented" };
  }
}

export default OpenAIProvider;
