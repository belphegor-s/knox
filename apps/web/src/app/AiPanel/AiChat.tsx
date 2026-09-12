import { useState } from "react";
import { useAiStore } from "../../state/ai-store";
import { useEditorStore } from "../../state/editor-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import "./AiChat.css";

export function AiChat(): React.ReactElement {
  const messages = useAiStore((s) => s.messages);
  const streaming = useAiStore((s) => s.streaming);
  const error = useAiStore((s) => s.error);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const stopStreaming = useAiStore((s) => s.stopStreaming);
  const clearChat = useAiStore((s) => s.clearChat);
  const lastContext = useAiStore((s) => s.lastContext);
  const contextPreviewOpen = useAiStore((s) => s.contextPreviewOpen);
  const toggleContextPreview = useAiStore((s) => s.toggleContextPreview);
  const activePath = useEditorStore((s) => s.activePath);
  const fs = useWorkspaceStore((s) => s.fs);
  const [input, setInput] = useState("");

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    let currentFile: { path: string; content: string } | undefined;
    if (activePath && fs) {
      try {
        currentFile = { path: activePath, content: await fs.readTextFile(activePath) };
      } catch {
        currentFile = undefined;
      }
    }
    await sendMessage(text, { currentFile });
  }

  return (
    <div className="knox-aichat">
      <div className="knox-aichat__thread">
        {messages.length === 0 && <div className="knox-aichat__empty">Ask about {activePath ? activePath.split("/").pop() : "your code"}.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`knox-aichat__message knox-aichat__message--${m.role}`}>
            <div className="knox-aichat__role">{m.role === "user" ? "You" : "AI"}</div>
            <div className="knox-aichat__content">{m.content || (streaming ? "…" : "")}</div>
          </div>
        ))}
      </div>

      {error && <div className="knox-aichat__error">{error}</div>}

      {lastContext && (
        <div className="knox-aichat__context">
          <button className="knox-aichat__context-toggle" onClick={toggleContextPreview}>
            AI Context: {lastContext.files.length} file{lastContext.files.length === 1 ? "" : "s"} · ~{lastContext.estimatedTokens} tokens
            {contextPreviewOpen ? " ▾" : " ▸"}
          </button>
          {contextPreviewOpen && (
            <div className="knox-aichat__context-detail">
              {lastContext.files.map((f) => (
                <div key={f.path}>
                  ✓ {f.path} <span className="knox-aichat__context-reason">({f.reason}{f.redacted ? ", secrets redacted" : ""})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="knox-aichat__composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask a question or request a change…"
        />
        <div className="knox-aichat__composer-actions">
          <button onClick={clearChat} disabled={messages.length === 0}>
            Clear
          </button>
          {streaming ? (
            <button className="knox-btn knox-btn--primary" onClick={stopStreaming}>
              Stop
            </button>
          ) : (
            <button className="knox-btn knox-btn--primary" onClick={() => void handleSend()} disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
