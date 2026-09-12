import { useEffect, useMemo, useRef, useState } from "react";
import "./Palette.css";

export interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  run: () => void | Promise<void>;
}

interface PaletteProps {
  title: string;
  placeholder: string;
  // recomputed every keystroke - keep cheap or memoize upstream
  search: (query: string) => PaletteItem[];
  onClose: () => void;
  emptyMessage?: string;
}

// Shared modal shell for the Command Palette and Quick Open.
export function Palette({ title, placeholder, search, onClose, emptyMessage }: PaletteProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const items = useMemo(() => search(query), [query, search]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        onClose();
        void item.run();
      }
    }
  }

  return (
    <div className="knox-palette-overlay" onMouseDown={onClose}>
      <div className="knox-palette" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="knox-palette__input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-activedescendant={items[activeIndex] ? `knox-palette-item-${items[activeIndex].id}` : undefined}
        />
        <div className="knox-palette__list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="knox-palette__empty">{emptyMessage ?? "No results"}</div>}
          {items.map((item, i) => (
            <div
              key={item.id}
              id={`knox-palette-item-${item.id}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`knox-palette__item${i === activeIndex ? " knox-palette__item--active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onClose();
                void item.run();
              }}
            >
              <span className="knox-palette__item-label">{item.label}</span>
              {item.sublabel && <span className="knox-palette__item-sublabel">{item.sublabel}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
