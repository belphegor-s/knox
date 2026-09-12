import { useState } from "react";
import { X } from "lucide-react";
import { PROVIDER_PRESETS, type ProviderConfig } from "@knox/ai";
import { createId } from "@knox/shared";
import { useAiStore } from "../../state/ai-store";
import "./AiSettings.css";

export function AiSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const providers = useAiStore((s) => s.providers);
  const activeProviderId = useAiStore((s) => s.activeProviderId);
  const saveProvider = useAiStore((s) => s.saveProvider);
  const removeProvider = useAiStore((s) => s.removeProvider);
  const setActiveProvider = useAiStore((s) => s.setActiveProvider);

  const [presetIndex, setPresetIndex] = useState(0);
  const [name, setName] = useState(PROVIDER_PRESETS[0]!.name);
  const [endpoint, setEndpoint] = useState(PROVIDER_PRESETS[0]!.endpoint);
  const [model, setModel] = useState(PROVIDER_PRESETS[0]!.modelHint);
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.7);

  function applyPreset(index: number): void {
    setPresetIndex(index);
    const preset = PROVIDER_PRESETS[index]!;
    setName(preset.name);
    setEndpoint(preset.endpoint);
    setModel(preset.modelHint);
  }

  async function handleSave(): Promise<void> {
    if (!endpoint.trim() || !model.trim()) return;
    const config: ProviderConfig = {
      id: createId("provider"),
      type: PROVIDER_PRESETS[presetIndex]!.type,
      name: name.trim() || "Provider",
      endpoint: endpoint.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      temperature,
    };
    await saveProvider(config);
    setApiKey("");
  }

  return (
    <div className="knox-aisettings">
      <div className="knox-aisettings__header">
        <span>AI Providers</span>
        <button onClick={onClose}>Close</button>
      </div>

      {providers.length > 0 && (
        <div className="knox-aisettings__list">
          {providers.map((p) => (
            <div key={p.id} className="knox-aisettings__item">
              <label>
                <input type="radio" checked={p.id === activeProviderId} onChange={() => void setActiveProvider(p.id)} />
                <span className="knox-aisettings__item-name">{p.name}</span>
                <span className="knox-aisettings__item-model">{p.model}</span>
              </label>
              <button className="knox-aisettings__item-remove" onClick={() => void removeProvider(p.id)} aria-label={`Remove ${p.name}`}>
                <X size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="knox-aisettings__form">
        <div className="knox-aisettings__form-title">Connect a provider</div>
        <label className="knox-aisettings__field">
          Preset
          <select value={presetIndex} onChange={(e) => applyPreset(Number(e.target.value))}>
            {PROVIDER_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="knox-aisettings__field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="knox-aisettings__field">
          Endpoint
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" />
        </label>
        <label className="knox-aisettings__field">
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model-id" />
        </label>
        <label className="knox-aisettings__field">
          API key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="stored locally only" />
        </label>
        <label className="knox-aisettings__field">
          Temperature: {temperature.toFixed(1)}
          <input type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
        </label>
        <button className="knox-btn knox-btn--primary" onClick={() => void handleSave()}>
          Save provider
        </button>
        <p className="knox-aisettings__note">
          The key is stored only in this browser's IndexedDB and sent only in requests you make directly to this endpoint - never
          proxied anywhere else.
        </p>
      </div>
    </div>
  );
}
