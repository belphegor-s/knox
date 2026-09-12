import { useEffect } from "react";

export interface Command {
  id: string;
  title: string;
  category: "Navigation" | "Editing" | "Terminal" | "Git" | "AI" | "Panels" | "File" | "View";
  shortcut?: string;
  run: () => void | Promise<void>;
  /** Optional guard; hidden from the palette when it returns false. */
  when?: () => boolean;
}

// Single source of truth for every app action; the palette, shortcuts, and future extensions all read from here.
class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private listeners = new Set<() => void>();

  register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.notify();
    return () => {
      this.commands.delete(command.id);
      this.notify();
    };
  }

  registerAll(commands: Command[]): () => void {
    const disposers = commands.map((c) => this.register(c));
    return () => disposers.forEach((d) => d());
  }

  list(): Command[] {
    return [...this.commands.values()].filter((c) => c.when?.() ?? true);
  }

  async run(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    await command.run();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const commandRegistry = new CommandRegistry();

export function useRegisterCommands(commands: Command[], deps: React.DependencyList): void {
  useEffect(() => {
    return commandRegistry.registerAll(commands);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
