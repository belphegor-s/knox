import type { AiProvider, ChatMessage, ProviderConfig, StreamChatOptions } from "../types.js";
import { parseSseStream } from "../sse.js";

/** Works with OpenAI, OpenRouter, Ollama, vLLM, or any /chat/completions-compatible endpoint. */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly config: ProviderConfig) {}

  async *streamChat(messages: ChatMessage[], options?: StreamChatOptions): AsyncIterable<string> {
    const res = await fetch(`${this.config.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        stream: true,
      }),
      signal: options?.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Provider request failed (${res.status}): ${text || res.statusText}`);
    }
    for await (const payload of parseSseStream(res.body)) {
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // ignore a malformed chunk rather than aborting the whole stream
      }
    }
  }
}
