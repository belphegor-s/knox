import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TerminalSession } from "./session.js";
import { longestCommonPrefix, wordEndAfter, wordStartBefore } from "./line-editing.js";
import "@xterm/xterm/css/xterm.css";

const PROMPT = "$ ";

export interface TerminalViewProps {
  workspaceId: string;
  fsBackend: string;
  directoryHandle?: FileSystemDirectoryHandle;
}

/** Real xterm.js terminal backed by a worker-hosted shell - never fakes output. */
export function TerminalView({ workspaceId, fsBackend, directoryHandle }: TerminalViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let session: TerminalSession | null = null;
    let line = "";
    let cursor = 0;
    const history: string[] = [];
    let historyIndex = -1;

    const term = new Terminal({
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 13,
      theme: { background: "#0e0f11", foreground: "#d8dadd", cursor: "#c1602f" },
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    // xterm's own renderer hasn't measured character dimensions yet in the tick fit() would
    // otherwise run in (right after open(), or on a container whose layout hasn't settled -
    // e.g. right after the panel is unhidden or un-maximized) - it throws inside its own
    // internals (Viewport.syncScrollArea reads a dimensions object that doesn't exist yet).
    // This is a documented xterm.js FitAddon timing quirk, not something a fixed delay reliably
    // dodges, so every call is wrapped rather than just the first one.
    function safeFit(): void {
      try {
        fit.fit();
      } catch {
        // Ignored: xterm wasn't ready to measure yet. The next resize/paint retries it.
      }
    }
    requestAnimationFrame(safeFit);

    function writePrompt(): void {
      line = "";
      cursor = 0;
      term.write(`\r\n${PROMPT}`);
    }

    /** Full reflow: erase the row, rewrite prompt+line, then walk the terminal cursor back to `cursor`. */
    function redrawLine(): void {
      term.write(`\r\x1b[K${PROMPT}${line}`);
      const back = line.length - cursor;
      if (back > 0) term.write(`\x1b[${back}D`);
    }

    function insertText(text: string): void {
      const atEnd = cursor === line.length;
      line = line.slice(0, cursor) + text + line.slice(cursor);
      cursor += text.length;
      if (atEnd) term.write(text);
      else redrawLine();
    }

    function backspace(): void {
      if (cursor === 0) return;
      const atEnd = cursor === line.length;
      line = line.slice(0, cursor - 1) + line.slice(cursor);
      cursor--;
      if (atEnd) term.write("\b \b");
      else redrawLine();
    }

    function deleteForward(): void {
      if (cursor >= line.length) return;
      line = line.slice(0, cursor) + line.slice(cursor + 1);
      redrawLine();
    }

    function moveCursor(delta: number): void {
      const next = Math.max(0, Math.min(line.length, cursor + delta));
      if (next === cursor) return;
      term.write(delta < 0 ? `\x1b[${cursor - next}D` : `\x1b[${next - cursor}C`);
      cursor = next;
    }

    function moveCursorTo(pos: number): void {
      moveCursor(pos - cursor);
    }

    function killToEnd(): void {
      if (cursor >= line.length) return;
      line = line.slice(0, cursor);
      term.write("\x1b[K");
    }

    function killToStart(): void {
      if (cursor === 0) return;
      line = line.slice(cursor);
      cursor = 0;
      redrawLine();
    }

    function deleteWordBackward(): void {
      const start = wordStartBefore(line, cursor);
      if (start === cursor) return;
      line = line.slice(0, start) + line.slice(cursor);
      cursor = start;
      redrawLine();
    }

    function jumpWordBackward(): void {
      moveCursorTo(wordStartBefore(line, cursor));
    }

    function jumpWordForward(): void {
      moveCursorTo(wordEndAfter(line, cursor));
    }

    function historyUp(): void {
      if (historyIndex <= 0) return;
      historyIndex--;
      line = history[historyIndex] ?? "";
      cursor = line.length;
      redrawLine();
    }

    function historyDown(): void {
      historyIndex = Math.min(historyIndex + 1, history.length);
      line = history[historyIndex] ?? "";
      cursor = line.length;
      redrawLine();
    }

    async function runLine(input: string): Promise<void> {
      term.write("\r\n");
      if (input.trim()) {
        history.push(input);
        historyIndex = history.length;
        await session?.execute(input);
      }
      writePrompt();
    }

    async function handleTab(): Promise<void> {
      if (!session) return;
      const beforeCursor = line.slice(0, cursor);
      const candidates = await session.complete(beforeCursor);
      if (candidates.length === 0) return;

      const wordStart = beforeCursor.endsWith(" ") ? beforeCursor.length : beforeCursor.lastIndexOf(" ") + 1;
      const partial = beforeCursor.slice(wordStart);

      if (candidates.length === 1) {
        const extra = candidates[0]!.slice(partial.length);
        if (extra) insertText(extra);
        return;
      }

      const commonPrefix = longestCommonPrefix(candidates);
      if (commonPrefix.length > partial.length) {
        insertText(commonPrefix.slice(partial.length));
        return;
      }

      // Ambiguous with no further shared prefix - list the options below, then redraw the
      // in-progress line on its OWN fresh row (redrawLine erases in place, so without this
      // trailing newline it would erase the candidate list we just printed).
      term.write(`\r\n${candidates.join("  ")}\r\n`);
      redrawLine();
    }

    term.writeln("Knox terminal - local shell over your workspace. Type `help` for commands.");
    term.write(PROMPT);

    // Exact escape sequences below were captured from a real xterm.js instance in Chromium,
    // not guessed from docs - macOS Option/Ctrl combos don't all match common terminal lore.
    term.onData((data) => {
      if (data === "\r") {
        void runLine(line);
        return;
      }
      switch (data) {
        case "\t":
          void handleTab();
          return;
        case "\x7f": // Backspace
          backspace();
          return;
        case "\x1b[3~": // Delete (forward)
          deleteForward();
          return;
        case "\x03": // Ctrl+C
          term.write("^C");
          writePrompt();
          return;
        case "\x1b[D": // Left
          moveCursor(-1);
          return;
        case "\x1b[C": // Right
          moveCursor(1);
          return;
        case "\x1b[H": // Home
        case "\x01": // Ctrl+A
          moveCursorTo(0);
          return;
        case "\x1b[F": // End
        case "\x05": // Ctrl+E
          moveCursorTo(line.length);
          return;
        case "\x0b": // Ctrl+K: kill to end of line
          killToEnd();
          return;
        case "\x15": // Ctrl+U: kill to start of line
          killToStart();
          return;
        case "\x17": // Ctrl+W: delete word backward
        case "\x1b\x7f": // Option/Alt+Backspace: delete word backward
          deleteWordBackward();
          return;
        case "\x1bb": // Option/Alt+Left: jump word backward
          jumpWordBackward();
          return;
        case "\x1bf": // Option/Alt+Right: jump word forward
          jumpWordForward();
          return;
        case "\x1b[A": // Up: history back
          historyUp();
          return;
        case "\x1b[B": // Down: history forward
          historyDown();
          return;
      }
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        insertText(data);
      }
      // Any other unrecognized escape sequence is dropped rather than inserted as garbage.
    });

    void TerminalSession.create(workspaceId, fsBackend, directoryHandle).then((s) => {
      if (disposed) {
        s.dispose();
        return;
      }
      session = s;
      s.onOutput = (_stream, text) => term.write(text.replace(/\n/g, "\r\n"));
    });

    // Collapsing the bottom panel (BottomPanel.tsx) hides this container via the `hidden`
    // attribute rather than unmounting it, so its content-box drops to 0x0 - and fit() on a
    // zero-size container doesn't just no-op, it can compute degenerate rows/cols (per a
    // documented xterm.js FitAddon quirk) that then stick even after the container is
    // properly sized again on expand, corrupting the rendered viewport (text overflowing or
    // getting clipped at the wrong boundary). A real resize to zero never legitimately
    // happens otherwise, so skipping it here costs nothing.
    const resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) safeFit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      session?.dispose();
      term.dispose();
    };
  }, [workspaceId, fsBackend, directoryHandle]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", padding: "4px 0 0 8px" }} />;
}
