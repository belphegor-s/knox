import "./AiPanel.css";

export function AiPanel(): React.ReactElement {
  return (
    <aside className="knox-aipanel" aria-label="AI assistant">
      <div className="knox-aipanel__header">AI</div>
      <div className="knox-aipanel__empty">
        <p>AI isn't configured.</p>
        <p className="knox-aipanel__empty-detail">
          Connect a provider (OpenAI, Anthropic, OpenRouter, or a local/self-hosted endpoint) or continue without AI.
        </p>
        <button className="knox-btn" disabled title="Provider settings arrive with the AI package">
          Connect a provider
        </button>
      </div>
    </aside>
  );
}
