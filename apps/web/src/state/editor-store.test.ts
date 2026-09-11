import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editor-store";

beforeEach(() => {
  useEditorStore.getState().closeAll();
});

describe("useEditorStore", () => {
  it("opens a preview tab and replaces it on the next preview open", () => {
    const { openFile } = useEditorStore.getState();
    openFile("/a.ts", { preview: true });
    openFile("/b.ts", { preview: true });
    const { tabs, activePath } = useEditorStore.getState();
    expect(tabs.map((t) => t.path)).toEqual(["/b.ts"]);
    expect(activePath).toBe("/b.ts");
  });

  it("pins a tab instead of replacing it on the next preview open", () => {
    const { openFile, pinTab } = useEditorStore.getState();
    openFile("/a.ts", { preview: true });
    pinTab("/a.ts");
    openFile("/b.ts", { preview: true });
    const { tabs } = useEditorStore.getState();
    expect(tabs.map((t) => t.path)).toEqual(["/a.ts", "/b.ts"]);
  });

  it("does not duplicate a tab that's already open", () => {
    const { openFile } = useEditorStore.getState();
    openFile("/a.ts", { preview: false });
    openFile("/a.ts", { preview: false });
    expect(useEditorStore.getState().tabs).toHaveLength(1);
  });

  it("activates a neighboring tab when the active tab is closed", () => {
    const { openFile, closeTab } = useEditorStore.getState();
    openFile("/a.ts");
    openFile("/b.ts");
    openFile("/c.ts");
    closeTab("/b.ts");
    expect(useEditorStore.getState().activePath).toBe("/c.ts");
  });

  it("clears activePath when the last tab is closed", () => {
    const { openFile, closeTab } = useEditorStore.getState();
    openFile("/a.ts");
    closeTab("/a.ts");
    expect(useEditorStore.getState().activePath).toBeNull();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it("tracks dirty state independently per tab", () => {
    const { openFile, setDirty } = useEditorStore.getState();
    openFile("/a.ts");
    openFile("/b.ts");
    setDirty("/a.ts", true);
    const { tabs } = useEditorStore.getState();
    expect(tabs.find((t) => t.path === "/a.ts")?.dirty).toBe(true);
    expect(tabs.find((t) => t.path === "/b.ts")?.dirty).toBe(false);
  });
});
