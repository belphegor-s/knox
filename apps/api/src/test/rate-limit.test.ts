import { beforeEach, describe, expect, it } from "vitest";
import { isRateLimited, pruneRateLimitState } from "../rate-limit.js";

describe("isRateLimited", () => {
  beforeEach(() => {
    pruneRateLimitState(0);
  });

  it("allows requests up to the limit", () => {
    const key = "client-a";
    for (let i = 0; i < 3; i++) {
      expect(isRateLimited(key, 3, 60_000)).toBe(false);
    }
  });

  it("blocks once the limit is exceeded within the window", () => {
    const key = "client-b";
    for (let i = 0; i < 3; i++) isRateLimited(key, 3, 60_000);
    expect(isRateLimited(key, 3, 60_000)).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    for (let i = 0; i < 3; i++) isRateLimited("client-c", 3, 60_000);
    expect(isRateLimited("client-d", 3, 60_000)).toBe(false);
  });

  it("prune removes entries with no timestamps inside the window", () => {
    isRateLimited("client-e", 3, 0);
    pruneRateLimitState(0);
    expect(isRateLimited("client-e", 3, 60_000)).toBe(false);
  });
});
