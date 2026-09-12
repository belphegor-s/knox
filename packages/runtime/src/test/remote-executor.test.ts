import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runRemote } from "../remote-executor.js";

function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
}

describe("runRemote", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("streams stdout/stderr and resolves the exit code from a successful run", async () => {
    const events: [string, string][] = [];
    globalThis.fetch = vi.fn(async () =>
      new Response(ndjsonStream([JSON.stringify({ type: "stdout", data: "hi\n" }), JSON.stringify({ type: "exit", code: 0 })]), {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    ) as typeof fetch;

    const result = await runRemote({
      language: "python",
      filename: "main.py",
      code: "print('hi')",
      onOutput: (stream, text) => events.push([stream, text]),
    });

    expect(result).toMatchObject({ exitCode: 0, timedOut: false, unavailable: false });
    expect(events).toEqual([["stdout", "hi\n"]]);
  });

  it("reports a structured backend error without marking the service unavailable", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "Unsupported language: cobol" }), { status: 400 }),
    ) as typeof fetch;

    const events: [string, string][] = [];
    const result = await runRemote({
      language: "cobol",
      filename: "main.cbl",
      code: "",
      onOutput: (stream, text) => events.push([stream, text]),
    });

    expect(result.unavailable).toBe(false);
    expect(events).toEqual([["stderr", "Unsupported language: cobol\n"]]);
  });

  it("marks the service unavailable when the response isn't from our API (e.g. a bare 404)", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>not found</html>", { status: 404 })) as typeof fetch;

    const result = await runRemote({ language: "python", filename: "main.py", code: "" });
    expect(result.unavailable).toBe(true);
  });

  it("marks the service unavailable when fetch itself fails (nothing deployed at all)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const result = await runRemote({ language: "python", filename: "main.py", code: "" });
    expect(result.unavailable).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});
