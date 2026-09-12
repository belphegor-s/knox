import type { AiProvider, ChatMessage, ProviderConfig, StreamChatOptions } from "../types.js";
import { parseSseStream } from "../sse.js";

/** Anthropic Messages API. Requires the direct-browser-access header since the API blocks browser origins by default. */
export class AnthropicProvider implements AiProvider {
  constructor(private readonly config: ProviderConfig) {}

  async *streamChat(messages: ChatMessage[], options?: StreamChatOptions): AsyncIterable<string> {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.config.endpoint.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.config.model,
        system,
        messages: rest,
        max_tokens: 4096,
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
      try {
        const json = JSON.parse(payload);
        if (json.type === "content_block_delta" && json.delta?.text) yield json.delta.text as string;
      } catch {
        // ignore a malformed chunk rather than aborting the whole stream
      }
    }
  }
}
