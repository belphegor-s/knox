import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "0b6f1c2e-5d7a-4f3b-9a8c-1e2d3f4a5b6c";

vi.mock("../sessions.js", () => ({
  lookupActiveSession: vi.fn(async (id: string) =>
    id === SESSION_ID ? { publicIp: "10.0.0.5", expiresAt: new Date("2030-01-01T00:00:00Z"), userId: "user-owner" } : null,
  ),
  stopSessionNow: vi.fn(),
}));

describe("session proxy auth gate", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.KNOX_SESSION_DOMAIN = "procd.cc";
    process.env.KNOX_ACCOUNT_API_URL = "http://account.internal";
    process.env.KNOX_ACCOUNT_PUBLIC_URL = "https://knox-api.procd.cc";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
        const cookie = init?.headers?.Cookie ?? "";
        if (cookie === "knox_session=owner-token") return new Response(JSON.stringify({ userId: "user-owner", email: "o@example.com", login: "owner" }));
        if (cookie === "knox_session=other-token") return new Response(JSON.stringify({ userId: "user-other", email: "x@example.com", login: "other" }));
        return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the owning account through to the session's container", async () => {
    const { authorizeSessionRequest } = await import("../proxy.js");
    const auth = await authorizeSessionRequest(`${SESSION_ID}.procd.cc`, "theme=dark; knox_session=owner-token");
    expect(auth).toMatchObject({ kind: "ok", sessionId: SESSION_ID, target: "http://10.0.0.5:8080" });
  });

  it("asks a signed-out browser to sign in", async () => {
    const { authorizeSessionRequest } = await import("../proxy.js");
    expect(await authorizeSessionRequest(`${SESSION_ID}.procd.cc`, undefined)).toEqual({ kind: "sign-in" });
    expect(await authorizeSessionRequest(`${SESSION_ID}.procd.cc`, "knox_session=expired")).toEqual({ kind: "sign-in" });
  });

  it("refuses a different signed-in account, even with the exact session URL", async () => {
    const { authorizeSessionRequest } = await import("../proxy.js");
    expect(await authorizeSessionRequest(`${SESSION_ID}.procd.cc`, "knox_session=other-token")).toEqual({ kind: "forbidden" });
  });

  it("ignores hosts that aren't a live session", async () => {
    const { authorizeSessionRequest } = await import("../proxy.js");
    expect(await authorizeSessionRequest("knox.procd.cc", "knox_session=owner-token")).toEqual({ kind: "not-a-session" });
    expect(await authorizeSessionRequest("11111111-2222-4333-8444-555555555555.procd.cc", "knox_session=owner-token")).toEqual({ kind: "not-a-session" });
  });

  it("builds a sign-in URL that returns to the session", async () => {
    const { signInUrl } = await import("../account-auth.js");
    expect(signInUrl(`https://${SESSION_ID}.procd.cc/`)).toBe(
      `https://knox-api.procd.cc/auth/github?redirect=${encodeURIComponent(`https://${SESSION_ID}.procd.cc/`)}`,
    );
  });
});

describe("cookie handling", () => {
  it("strips only Knox's session cookie before forwarding to code-server", async () => {
    const { stripSessionCookie } = await import("../account-auth.js");
    expect(stripSessionCookie("a=1; knox_session=secret; b=2")).toBe("a=1; b=2");
    expect(stripSessionCookie("knox_session=secret")).toBeUndefined();
    expect(stripSessionCookie("knox_session_other=1")).toBe("knox_session_other=1");
    expect(stripSessionCookie(undefined)).toBeUndefined();
  });

  it("reads the session token out of a multi-cookie header", async () => {
    const { sessionTokenFromCookieHeader } = await import("../account-auth.js");
    expect(sessionTokenFromCookieHeader("x=1; knox_session=abc; y=2")).toBe("abc");
    expect(sessionTokenFromCookieHeader("x=1")).toBeNull();
  });
});
