export type ProviderType = "openai-compatible" | "anthropic";

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamChatOptions {
  signal?: AbortSignal;
}

export interface AiProvider {
  streamChat(messages: ChatMessage[], options?: StreamChatOptions): AsyncIterable<string>;
}
