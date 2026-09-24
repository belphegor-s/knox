import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ pool: { query: vi.fn() } }));

let auth: typeof import("../auth.js");
beforeAll(async () => {
  process.env.KNOX_COOKIE_DOMAIN = ".procd.cc";
  process.env.GITHUB_CLIENT_ID = "client-id";
  process.env.GITHUB_CLIENT_SECRET = "client-secret";
  auth = await import("../auth.js");
});

function stateCookieValue(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf("=") + 1, setCookie.indexOf(";"));
}

describe("GitHub OAuth state", () => {
  it("round-trips the redirect when GitHub returns the same state", () => {
    const { authorizeUrl, stateCookie } = auth.beginGithubSignIn("https://knox-api.procd.cc/auth/github/callback", "https://knox.procd.cc/?launch=1");
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    expect(new URL(authorizeUrl).searchParams.get("redirect_uri")).toBe("https://knox-api.procd.cc/auth/github/callback");
    expect(auth.checkOauthState(stateCookieValue(stateCookie), state)).toEqual({ redirect: "https://knox.procd.cc/?launch=1" });
  });

  it("uses a __Host- cookie so no sibling subdomain can plant it", () => {
    const { stateCookie } = auth.beginGithubSignIn("https://x/cb", "https://knox.procd.cc/");
    expect(stateCookie.startsWith("__Host-")).toBe(true);
    expect(stateCookie).toContain("Secure");
    expect(stateCookie).toContain("Path=/");
    expect(stateCookie).not.toContain("Domain=");
  });

  it("rejects a mismatched or missing state", () => {
    const { stateCookie } = auth.beginGithubSignIn("https://x/cb", "https://knox.procd.cc/");
    expect(auth.checkOauthState(stateCookieValue(stateCookie), "forged")).toBeNull();
    expect(auth.checkOauthState(undefined, "anything")).toBeNull();
    expect(auth.checkOauthState(stateCookieValue(stateCookie), undefined)).toBeNull();
  });
});

describe("redirect targets", () => {
  it("allows https on the cookie domain and its subdomains", () => {
    expect(auth.sanitizeRedirectTarget("https://knox.procd.cc/?launch=1", "/fallback")).toBe("https://knox.procd.cc/?launch=1");
    expect(auth.sanitizeRedirectTarget("https://procd.cc/", "/fallback")).toBe("https://procd.cc/");
  });

  it("falls back for anything else", () => {
    expect(auth.sanitizeRedirectTarget("https://evil.com/", "/fallback")).toBe("/fallback");
    expect(auth.sanitizeRedirectTarget("https://procd.cc.evil.com/", "/fallback")).toBe("/fallback");
    expect(auth.sanitizeRedirectTarget("http://knox.procd.cc/", "/fallback")).toBe("/fallback");
    expect(auth.sanitizeRedirectTarget("javascript:alert(1)", "/fallback")).toBe("/fallback");
    expect(auth.sanitizeRedirectTarget(undefined, "/fallback")).toBe("/fallback");
  });
});
