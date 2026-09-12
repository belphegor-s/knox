import { commandRegistry } from "../commands/registry";
import "./KeyboardShortcutsHelp.css";

const CATEGORY_ORDER = ["Navigation", "Editing", "Terminal", "Git", "AI", "Panels", "File", "View"] as const;

export function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }): React.ReactElement {
  const withShortcuts = commandRegistry.list().filter((c) => c.shortcut);
  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, commands: withShortcuts.filter((c) => c.category === cat) })).filter(
    (g) => g.commands.length > 0,
  );

  return (
    <div className="knox-shortcuts-overlay" onMouseDown={onClose}>
      <div className="knox-shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="knox-shortcuts__header">
          <span>Keyboard Shortcuts</span>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="knox-shortcuts__body">
          {grouped.map(({ cat, commands }) => (
            <div key={cat} className="knox-shortcuts__group">
              <div className="knox-shortcuts__group-title">{cat}</div>
              {commands.map((c) => (
                <div key={c.id} className="knox-shortcuts__row">
                  <span>{c.title.replace(/^[A-Za-z]+:\s*/, "")}</span>
                  <kbd>{c.shortcut}</kbd>
                </div>
              ))}
            </div>
          ))}
          <p className="knox-shortcuts__note">
            Plain ⌘W isn't bound to anything here on purpose: Chrome closes the actual browser tab
            on Ctrl/Cmd+W no matter what a page does, so binding it would close your editor tab and
            the browser tab together. Use ⌘⇧W to close an editor tab instead. Your workspace and open
            tabs auto-restore on reload regardless.
          </p>
        </div>
      </div>
    </div>
  );
}
