import { describe, expect, it } from "vitest";
import { extractSessionId } from "../proxy.js";

const DOMAIN = "sessions.knox.procd.cc";

describe("extractSessionId", () => {
  it("extracts the session id from a matching subdomain", () => {
    expect(extractSessionId(`abc123.${DOMAIN}`, DOMAIN)).toBe("abc123");
  });

  it("strips a port from the host before matching", () => {
    expect(extractSessionId(`abc123.${DOMAIN}:8443`, DOMAIN)).toBe("abc123");
  });

  it("returns null for the bare session domain with no subdomain", () => {
    expect(extractSessionId(DOMAIN, DOMAIN)).toBeNull();
  });

  it("returns null for an unrelated host", () => {
    expect(extractSessionId("knox.procd.cc", DOMAIN)).toBeNull();
  });

  it("returns null when host or domain is missing", () => {
    expect(extractSessionId(undefined, DOMAIN)).toBeNull();
    expect(extractSessionId(`abc123.${DOMAIN}`, "")).toBeNull();
  });

  it("does not treat a domain that merely contains the session domain as a match", () => {
    // e.g. "evil-sessions.knox.procd.cc.attacker.com" must not be treated as a valid subdomain
    expect(extractSessionId(`abc123.${DOMAIN}.attacker.com`, DOMAIN)).toBeNull();
  });
});
