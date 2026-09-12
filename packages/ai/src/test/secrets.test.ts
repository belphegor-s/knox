import { describe, expect, it } from "vitest";
import { detectSecrets, redactSecrets } from "../secrets.js";

describe("detectSecrets", () => {
  it("detects an AWS access key", () => {
    const matches = detectSecrets("key = AKIAIOSFODNN7EXAMPLE");
    expect(matches.some((m) => m.name === "AWS Access Key")).toBe(true);
  });

  it("detects a GitHub token", () => {
    const matches = detectSecrets("ghp_" + "a".repeat(36));
    expect(matches.some((m) => m.name === "GitHub Token")).toBe(true);
  });

  it("detects a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ";
    expect(detectSecrets(jwt).some((m) => m.name === "JWT")).toBe(true);
  });

  it("finds nothing in ordinary code", () => {
    expect(detectSecrets("export function add(a, b) { return a + b; }")).toHaveLength(0);
  });
});

describe("redactSecrets", () => {
  it("replaces a detected secret and reports what was found", () => {
    const { redacted, found } = redactSecrets("const key = 'AKIAIOSFODNN7EXAMPLE';");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted).toContain("[REDACTED:AWS Access Key]");
    expect(found).toContain("AWS Access Key");
  });

  it("leaves clean text untouched", () => {
    const { redacted, found } = redactSecrets("plain code here");
    expect(redacted).toBe("plain code here");
    expect(found).toHaveLength(0);
  });
});
