import { useEffect, useState } from "react";
import { useAiStore } from "../../state/ai-store";
import { AiSettings } from "./AiSettings";
import { AiChat } from "./AiChat";
import "./AiPanel.css";

export function AiPanel(): React.ReactElement {
  const loaded = useAiStore((s) => s.loaded);
  const load = useAiStore((s) => s.load);
  const providers = useAiStore((s) => s.providers);
  const activeProviderId = useAiStore((s) => s.activeProviderId);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const active = providers.find((p) => p.id === activeProviderId);

  return (
    <aside className="knox-aipanel" aria-label="AI assistant">
      <div className="knox-aipanel__header">
        <span>{active ? `AI · ${active.name}` : "AI"}</span>
        <button className="knox-aipanel__settings-btn" onClick={() => setShowSettings((v) => !v)} aria-label="AI settings">
          ⚙
        </button>
      </div>

      {!loaded ? null : showSettings ? (
        <AiSettings onClose={() => setShowSettings(false)} />
      ) : !active ? (
        <div className="knox-aipanel__empty">
          <p>AI isn't configured.</p>
          <p className="knox-aipanel__empty-detail">
            Connect a provider (OpenAI, Anthropic, OpenRouter, or a local/self-hosted endpoint) or continue without AI.
          </p>
          <button className="knox-btn knox-btn--primary" onClick={() => setShowSettings(true)}>
            Connect a provider
          </button>
        </div>
      ) : (
        <AiChat />
      )}
    </aside>
  );
}
