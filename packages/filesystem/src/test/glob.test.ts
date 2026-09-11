import { describe, expect, it } from "vitest";
import { matchesGlob } from "../glob.js";

describe("matchesGlob", () => {
  it("matches simple wildcards", () => {
    expect(matchesGlob("src/app.ts", "*.ts")).toBe(false);
    expect(matchesGlob("app.ts", "*.ts")).toBe(true);
  });

  it("matches ** across directories", () => {
    expect(matchesGlob("src/deep/nested/app.ts", "**/*.ts")).toBe(true);
    expect(matchesGlob("src/deep/nested/app.ts", "src/**/*.ts")).toBe(true);
  });

  it("matches directory-prefix excludes", () => {
    expect(matchesGlob("node_modules/pkg/index.js", "node_modules/**")).toBe(true);
    expect(matchesGlob("src/node_modules_like/x.js", "node_modules/**")).toBe(false);
  });
});
