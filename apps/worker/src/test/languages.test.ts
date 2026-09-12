import { describe, expect, it } from "vitest";
import { isSupportedLanguage, validateFilename } from "../languages.js";

describe("isSupportedLanguage", () => {
  it("accepts the languages the runner image actually has toolchains for", () => {
    for (const lang of ["python", "c", "cpp", "java", "go", "rust"]) {
      expect(isSupportedLanguage(lang)).toBe(true);
    }
  });
  it("rejects languages with no cloud runner, including ones that run locally", () => {
    for (const lang of ["javascript", "typescript", "ruby", "sql", ""]) {
      expect(isSupportedLanguage(lang)).toBe(false);
    }
  });
});

describe("validateFilename", () => {
  it("accepts a filename matching the language's expected extension", () => {
    expect(validateFilename("python", "main.py")).toBeNull();
    expect(validateFilename("cpp", "main.cpp")).toBeNull();
    expect(validateFilename("cpp", "main.cc")).toBeNull();
    expect(validateFilename("java", "Main.java")).toBeNull();
  });
  it("rejects a mismatched extension", () => {
    expect(validateFilename("python", "main.rs")).toMatch(/requires a file matching/);
  });
  it("rejects path traversal or nested paths", () => {
    expect(validateFilename("python", "../etc/passwd.py")).toMatch(/path separators/);
    expect(validateFilename("python", "sub/main.py")).toMatch(/path separators/);
  });
});
