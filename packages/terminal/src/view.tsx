import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TerminalSession } from "./session.js";
import "@xterm/xterm/css/xterm.css";

const PROMPT = "$ ";

export interface TerminalViewProps {
  workspaceId: string;
  fsBackend: string;
  directoryHandle?: FileSystemDirectoryHandle;
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0]!;
  for (const s of strings) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Real xterm.js terminal backed by a worker-hosted shell - never fakes output. */
export function TerminalView({ workspaceId, fsBackend, directoryHandle }: TerminalViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let session: TerminalSession | null = null;
    let line = "";
    const history: string[] = [];
    let historyIndex = -1;

    const term = new Terminal({
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 13,
      theme: { background: "#0e0f11", foreground: "#d8dadd", cursor: "#c9a567" },
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    function writePrompt(): void {
      term.write(`\r\n${PROMPT}`);
    }

    function redrawLine(): void {
      term.write(`\r\x1b[K${PROMPT}${line}`);
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
      const candidates = await session.complete(line);
      if (candidates.length === 0) return;

      const wordStart = line.endsWith(" ") ? line.length : line.lastIndexOf(" ") + 1;
      const partial = line.slice(wordStart);

      if (candidates.length === 1) {
        const extra = candidates[0]!.slice(partial.length);
        if (!extra) return;
        line += extra;
        term.write(extra);
        return;
      }

      const commonPrefix = longestCommonPrefix(candidates);
      if (commonPrefix.length > partial.length) {
        const extra = commonPrefix.slice(partial.length);
        line += extra;
        term.write(extra);
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

    term.onData((data) => {
      if (data === "\r") {
        const toRun = line;
        line = "";
        void runLine(toRun);
        return;
      }
      const code = data.charCodeAt(0);
      if (code === 9) {
        void handleTab();
        return;
      }
      if (code === 127) {
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }
      if (code === 3) {
        line = "";
        term.write("^C");
        writePrompt();
        return;
      }
      if (data === "[A") {
        if (historyIndex > 0) {
          historyIndex--;
          line = history[historyIndex] ?? "";
          redrawLine();
        }
        return;
      }
      if (data === "[B") {
        historyIndex = Math.min(historyIndex + 1, history.length);
        line = history[historyIndex] ?? "";
        redrawLine();
        return;
      }
      if (code >= 32) {
        line += data;
        term.write(data);
      }
    });

    void TerminalSession.create(workspaceId, fsBackend, directoryHandle).then((s) => {
      if (disposed) {
        s.dispose();
        return;
      }
      session = s;
      s.onOutput = (_stream, text) => term.write(text.replace(/\n/g, "\r\n"));
    });

    const resizeObserver = new ResizeObserver(() => fit.fit());
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
