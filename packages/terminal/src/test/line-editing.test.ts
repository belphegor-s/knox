import { describe, expect, it } from "vitest";
import { longestCommonPrefix, wordEndAfter, wordStartBefore } from "../line-editing.js";

describe("longestCommonPrefix", () => {
  it("returns the shared prefix of multiple strings", () => {
    expect(longestCommonPrefix(["hello.txt", "help-notes.md"])).toBe("hel");
  });
  it("returns the whole string when there is only one candidate", () => {
    expect(longestCommonPrefix(["echo"])).toBe("echo");
  });
  it("returns empty string when there is no shared prefix", () => {
    expect(longestCommonPrefix(["abc", "xyz"])).toBe("");
  });
  it("returns empty string for an empty list", () => {
    expect(longestCommonPrefix([])).toBe("");
  });
});

describe("wordStartBefore", () => {
  it("finds the start of the word immediately before the cursor", () => {
    expect(wordStartBefore("echo foo bar", 12)).toBe(9);
  });
  it("skips trailing whitespace before looking for the word", () => {
    expect(wordStartBefore("echo foo ", 9)).toBe(5);
  });
  it("stops at the start of the line", () => {
    expect(wordStartBefore("echo", 4)).toBe(0);
  });
  it("is a no-op at position 0", () => {
    expect(wordStartBefore("echo", 0)).toBe(0);
  });
});

describe("wordEndAfter", () => {
  it("finds the end of the word at or after the cursor", () => {
    expect(wordEndAfter("echo foo bar", 5)).toBe(8);
  });
  it("skips leading whitespace before looking for the word", () => {
    expect(wordEndAfter("echo foo", 4)).toBe(8);
  });
  it("stops at the end of the line", () => {
    expect(wordEndAfter("echo", 0)).toBe(4);
  });
  it("is a no-op at the end of the line", () => {
    expect(wordEndAfter("echo", 4)).toBe(4);
  });
});
