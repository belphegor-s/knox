import type { ApiKeySummary } from "./api-keys.js";
import type { UsageSummary } from "./usage.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const BASE_STYLE = `
  :root {
    --accent: #c1602f;
    --accent-fg: #fff6f0;
    --danger: #c1502f;
    --success: #8fb37a;
    --radius: 8px;
    --radius-lg: 14px;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  :root { --bg-0: #0b0c0e; --bg-1: #0e0f11; --bg-2: #16181b; --border: #232529; --border-strong: #34373c; --text-0: #eceef0; --text-1: #d8dadd; --text-2: #8b9099; --text-3: #5c6066; color-scheme: dark; }
  @media (prefers-color-scheme: light) {
    :root { --bg-0: #f4f2ef; --bg-1: #fbfaf8; --bg-2: #f0eee9; --border: #e3e0da; --border-strong: #cfccc5; --text-0: #16171a; --text-1: #24262b; --text-2: #63666d; --text-3: #96999f; color-scheme: light; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg-0); color: var(--text-1); font-family: var(--sans); font-size: 14px; line-height: 1.6; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 20px 80px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-0); text-decoration: none; margin-bottom: 40px; }
  .brand svg { width: 22px; height: 22px; }
  h1 { font-size: 22px; color: var(--text-0); margin: 0 0 8px; letter-spacing: -0.01em; }
  .sub { color: var(--text-2); margin: 0 0 28px; font-size: 14px; }
  .card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 20px; }
  label { display: block; font-size: 12.5px; color: var(--text-2); margin-bottom: 6px; }
  input[type="email"], input[type="text"] { width: 100%; padding: 10px 12px; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-0); color: var(--text-0); font-size: 14px; font-family: inherit; }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: var(--radius); border: 1px solid transparent; cursor: pointer; text-decoration: none; }
  .btn-primary { background: var(--accent); color: var(--accent-fg); }
  .btn-ghost { background: transparent; border-color: var(--border-strong); color: var(--text-1); }
  .btn-danger { background: transparent; border-color: var(--border-strong); color: var(--danger); }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .row { display: flex; gap: 8px; align-items: flex-end; }
  .row > div { flex: 1; }
  .key-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border); }
  .key-row:first-child { border-top: none; }
  .key-name { color: var(--text-0); font-weight: 600; }
  .key-meta { color: var(--text-3); font-size: 12px; font-family: var(--mono); }
  .key-revoked { color: var(--text-3); text-decoration: line-through; }
  .new-key-box { background: var(--bg-0); border: 1px dashed var(--accent); border-radius: var(--radius); padding: 14px; margin-top: 14px; font-family: var(--mono); font-size: 13px; word-break: break-all; color: var(--text-0); }
  .usage-bar { height: 6px; border-radius: 3px; background: var(--bg-0); overflow: hidden; margin-top: 8px; }
  .usage-bar-fill { height: 100%; background: var(--accent); }
  .usage-label { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-2); margin-top: 4px; }
  pre { background: var(--bg-0); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; overflow-x: auto; font-size: 12.5px; font-family: var(--mono); color: var(--text-1); }
  .msg { font-size: 13px; padding: 10px 14px; border-radius: var(--radius); margin-bottom: 16px; }
  .msg-error { background: rgba(193, 80, 47, 0.12); color: var(--danger); border: 1px solid rgba(193, 80, 47, 0.3); }
  .msg-success { background: rgba(143, 179, 122, 0.12); color: var(--success); border: 1px solid rgba(143, 179, 122, 0.3); }
  .footer-link { color: var(--text-2); font-size: 13px; }
`;

function brandHeader(): string {
  return `<a class="brand" href="https://knox.procd.cc/"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0e0f11"/><text x="16" y="22.5" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="18" fill="#c1602f" text-anchor="middle">K</text></svg> Knox API</a>`;
}

export function loginPageHtml(opts: { error?: string; sent?: boolean }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Sign in - Knox API</title><style>${BASE_STYLE}</style></head>
<body><div class="wrap">
  ${brandHeader()}
  <h1>Sign in</h1>
  <p class="sub">Get an API key to run code from your own scripts and apps - Python, C, C++, Java, Go, and Rust, with a 2-minute execution cap per run.</p>
  ${opts.error ? `<div class="msg msg-error">${escapeHtml(opts.error)}</div>` : ""}
  ${
    opts.sent
      ? `<div class="msg msg-success">Check your email for a sign-in link. It expires in 15 minutes.</div>`
      : `<div class="card">
    <form id="login-form">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required placeholder="you@example.com" />
      <div style="margin-top: 14px;"><button class="btn btn-primary" type="submit">Send sign-in link</button></div>
    </form>
  </div>
  <script>
    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("email").value;
      var btn = e.target.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Sending...";
      fetch("/auth/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) })
        .then(function () { window.location.href = "/account?sent=1"; })
        .catch(function () { window.location.href = "/account?error=" + encodeURIComponent("Could not send the link. Try again."); });
    });
  </script>`
  }
</div></body></html>`;
}

export function dashboardPageHtml(opts: { email: string; keys: ApiKeySummary[]; usage: UsageSummary; mintedKey?: string; error?: string }): string {
  const keyRows = opts.keys.length
    ? opts.keys
        .map((k) => {
          const revoked = k.revokedAt != null;
          return `<div class="key-row">
            <div>
              <div class="${revoked ? "key-revoked" : "key-name"}">${escapeHtml(k.name)}</div>
              <div class="key-meta">${escapeHtml(k.keyPrefix)}... &middot; created ${k.createdAt.toISOString().slice(0, 10)}${k.lastUsedAt ? ` &middot; last used ${k.lastUsedAt.toISOString().slice(0, 10)}` : ""}</div>
            </div>
            ${revoked ? `<span class="key-meta">revoked</span>` : `<button class="btn btn-danger" data-revoke="${escapeHtml(k.id)}">Revoke</button>`}
          </div>`;
        })
        .join("")
    : `<p class="sub" style="margin:0">No API keys yet.</p>`;

  const dailyPct = Math.min(100, Math.round((opts.usage.today / opts.usage.dailyCap) * 100));
  const monthlyPct = Math.min(100, Math.round((opts.usage.thisMonth / opts.usage.monthlyCap) * 100));

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Dashboard - Knox API</title><style>${BASE_STYLE}</style></head>
<body><div class="wrap">
  <div style="display:flex; justify-content:space-between; align-items:center;">
    ${brandHeader()}
    <form method="POST" action="/auth/logout"><button class="btn btn-ghost" type="submit">Sign out</button></form>
  </div>
  <h1>${escapeHtml(opts.email)}</h1>
  <p class="sub">Signed in.</p>
  ${opts.error ? `<div class="msg msg-error">${escapeHtml(opts.error)}</div>` : ""}
  ${opts.mintedKey ? `<div class="msg msg-success">API key created - copy it now, it won't be shown again.<div class="new-key-box">${escapeHtml(opts.mintedKey)}</div></div>` : ""}

  <div class="card">
    <h2 style="font-size:15px; color:var(--text-0); margin:0 0 14px;">Usage</h2>
    <div class="usage-label"><span>Today</span><span>${opts.usage.today} / ${opts.usage.dailyCap} runs</span></div>
    <div class="usage-bar"><div class="usage-bar-fill" style="width:${dailyPct}%"></div></div>
    <div class="usage-label" style="margin-top:14px;"><span>This month</span><span>${opts.usage.thisMonth} / ${opts.usage.monthlyCap} runs</span></div>
    <div class="usage-bar"><div class="usage-bar-fill" style="width:${monthlyPct}%"></div></div>
  </div>

  <div class="card">
    <h2 style="font-size:15px; color:var(--text-0); margin:0 0 14px;">API keys</h2>
    ${keyRows}
    <form id="create-key-form" class="row" style="margin-top:16px;">
      <div><label for="key-name">New key name</label><input type="text" id="key-name" placeholder="e.g. laptop, CI" required /></div>
      <button class="btn btn-primary" type="submit">Create key</button>
    </form>
  </div>

  <div class="card">
    <h2 style="font-size:15px; color:var(--text-0); margin:0 0 14px;">Call the API</h2>
    <pre>curl https://knox-api.procd.cc/v1/execute \\
  -H "Authorization: Bearer knox_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"language":"python","filename":"main.py","code":"print(1+1)"}'</pre>
    <p class="footer-link" style="margin:12px 0 0;">Languages: python, c, cpp, java, go, rust. Max 2 minutes per run.</p>
  </div>

  <script>
    document.getElementById("create-key-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("key-name").value;
      fetch("/account/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body.key) window.location.href = "/account?minted=" + encodeURIComponent(body.key);
          else window.location.href = "/account?error=" + encodeURIComponent(body.error || "Could not create key");
        });
    });
    document.querySelectorAll("[data-revoke]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Revoke this key? Anything using it will stop working immediately.")) return;
        fetch("/account/keys/" + btn.getAttribute("data-revoke"), { method: "DELETE" }).then(function () { window.location.reload(); });
      });
    });
  </script>
</div></body></html>`;
}
