import type { AiProvider, ProviderConfig } from "./types.js";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.js";
import { AnthropicProvider } from "./providers/anthropic.js";

export function createProvider(config: ProviderConfig): AiProvider {
  switch (config.type) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai-compatible":
      return new OpenAiCompatibleProvider(config);
  }
}

export const PROVIDER_PRESETS: { type: ProviderConfig["type"]; name: string; endpoint: string; modelHint: string }[] = [
  { type: "openai-compatible", name: "OpenAI", endpoint: "https://api.openai.com/v1", modelHint: "gpt-4o-mini" },
  { type: "openai-compatible", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", modelHint: "meta-llama/llama-3.1-8b-instruct" },
  { type: "openai-compatible", name: "Ollama (local)", endpoint: "http://localhost:11434/v1", modelHint: "llama3.1" },
  { type: "anthropic", name: "Anthropic", endpoint: "https://api.anthropic.com", modelHint: "claude-3-5-haiku-latest" },
  { type: "openai-compatible", name: "Custom endpoint", endpoint: "", modelHint: "" },
];
