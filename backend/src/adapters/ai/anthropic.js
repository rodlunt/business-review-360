import Anthropic from "@anthropic-ai/sdk";
import { AIProvider } from "./interface.js";

const DEFAULT_MODEL = process.env.BR360_AI_MODEL || "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1024;

export class AnthropicProvider extends AIProvider {
  constructor(apiKey) {
    super();
    this._client = new Anthropic({ apiKey });
  }

  get name() {
    return "anthropic";
  }

  async complete({ messages, system, model, maxTokens }) {
    const response = await this._client.messages.create({
      model: model ?? DEFAULT_MODEL,
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      system,
      messages,
    });

    return {
      content: response.content[0]?.text ?? "",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async validate() {
    try {
      // Minimal request to verify key without consuming significant quota.
      await this._client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

export default AnthropicProvider;
