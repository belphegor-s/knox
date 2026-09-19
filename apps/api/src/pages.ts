import type { ApiKeySummary } from "./api-keys.js";
import type { UsageSummary } from "./usage.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Same three fonts as the marketing site (apps/web/index.html) - these pages are the other half
// of the same product, not a separate tool, and a plain system-font dashboard sitting behind a
// typeset landing page reads as two different things bolted together.
const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />`;

const BASE_STYLE = `
  :root {
    --accent: #c1602f;
    --accent-fg: #fff6f0;
    --danger: #c1502f;
    --danger-fg: #fff6f0;
    --success: #8fb37a;
    --radius: 8px;
    --radius-lg: 14px;
    --control-h: 40px;
    --sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  :root { --bg-0: #0b0c0e; --bg-1: #0e0f11; --bg-2: #16181b; --border: #232529; --border-strong: #34373c; --text-0: #eceef0; --text-1: #d8dadd; --text-2: #8b9099; --text-3: #5c6066; --syn-string: #9fb87a; color-scheme: dark; }
  @media (prefers-color-scheme: light) {
    :root { --bg-0: #f4f2ef; --bg-1: #fbfaf8; --bg-2: #f0eee9; --border: #e3e0da; --border-strong: #cfccc5; --text-0: #16171a; --text-1: #24262b; --text-2: #63666d; --text-3: #96999f; --syn-string: #3f6b2a; color-scheme: light; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg-0); color: var(--text-1); font-family: var(--sans); font-size: 14px; line-height: 1.6; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 20px 80px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-0); text-decoration: none; margin-bottom: 40px; letter-spacing: -0.01em; }
  .brand svg { width: 22px; height: 22px; border-radius: 5px; }
  h1 { font-size: 22px; color: var(--text-0); margin: 0 0 8px; letter-spacing: -0.01em; }
  .sub { color: var(--text-2); margin: 0 0 28px; font-size: 14px; }
  .card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 20px; }
  .card h2 { font-size: 15px; font-weight: 600; color: var(--text-0); margin: 0 0 14px; }
  label { display: block; font-size: 12.5px; color: var(--text-2); margin-bottom: 6px; }
  input[type="email"], input[type="text"] { width: 100%; height: var(--control-h); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-0); color: var(--text-0); font-size: 14px; font-family: inherit; transition: border-color 0.15s ease; }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  input:disabled { opacity: 0.6; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: var(--control-h); font-size: 13.5px; font-weight: 600; padding: 0 16px; border-radius: var(--radius); border: 1px solid transparent; cursor: pointer; text-decoration: none; font-family: inherit; transition: opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease; }
  .btn-primary { background: var(--accent); color: var(--accent-fg); }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost { background: transparent; border-color: var(--border-strong); color: var(--text-1); }
  .btn-ghost:hover { border-color: var(--text-2); }
  .btn-danger { background: transparent; border-color: var(--border-strong); color: var(--danger); }
  .btn-danger:hover { border-color: var(--danger); background: rgba(193, 80, 47, 0.1); }
  .btn-danger-solid { background: var(--danger); color: var(--danger-fg); }
  .btn-danger-solid:hover { opacity: 0.88; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn:disabled:hover { border-color: var(--border-strong); background: transparent; opacity: 0.5; }
  .btn-primary:disabled:hover, .btn-danger-solid:disabled:hover { background: var(--accent); opacity: 0.5; }
  .btn-danger-solid:disabled:hover { background: var(--danger); }
  .spinner { display: inline-block; width: 12px; height: 12px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; opacity: 0.85; animation: knox-spin 0.6s linear infinite; flex-shrink: 0; }
  @keyframes knox-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .row { display: flex; gap: 8px; align-items: flex-end; }
  .row > div { flex: 1; }
  .key-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
  .key-row:first-child { border-top: none; }
  .key-name { color: var(--text-0); font-weight: 600; }
  .key-meta { color: var(--text-3); font-size: 12px; font-family: var(--mono); }
  .key-revoked { color: var(--text-3); text-decoration: line-through; }
  .new-key-box { background: var(--bg-0); border: 1px dashed var(--accent); border-radius: var(--radius); padding: 14px; margin-top: 14px; font-family: var(--mono); font-size: 13px; word-break: break-all; color: var(--text-0); }
  .usage-bar { height: 6px; border-radius: 3px; background: var(--bg-0); overflow: hidden; margin-top: 8px; }
  .usage-bar-fill { height: 100%; background: var(--accent); }
  .usage-label { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-2); margin-top: 4px; }
  pre { background: var(--bg-0); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; overflow-x: auto; font-size: 12.5px; font-family: var(--mono); color: var(--text-1); line-height: 1.8; }
  .tok-str { color: var(--syn-string); }
  .tok-c { color: var(--text-3); }
  .msg { font-size: 13px; padding: 10px 14px; border-radius: var(--radius); margin-bottom: 16px; }
  .msg-error { background: rgba(193, 80, 47, 0.12); color: var(--danger); border: 1px solid rgba(193, 80, 47, 0.3); }
  .msg-success { background: rgba(143, 179, 122, 0.12); color: var(--success); border: 1px solid rgba(143, 179, 122, 0.3); }
  .footer-link { color: var(--text-2); font-size: 13px; }

  /* ---- modal: same visual language as the launch overlay on the marketing site ---- */
  .modal-overlay { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; background: color-mix(in srgb, var(--bg-0) 78%, transparent); backdrop-filter: blur(6px); }
  .modal-overlay[hidden] { display: none; }
  .modal-card { width: 100%; max-width: 400px; background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 20px 18px; box-shadow: 0 30px 70px -24px rgba(0, 0, 0, 0.45); }
  .modal-title { font-size: 14.5px; font-weight: 600; color: var(--text-0); margin: 0 0 12px; }
  .modal-body { font-size: 13.5px; color: var(--text-2); line-height: 1.55; margin: 0; }
  .modal-body strong { color: var(--text-0); }
  .modal-error { font-size: 12.5px; color: var(--danger); margin: 12px 0 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
`;

function brandHeader(): string {
  return `<a class="brand" href="https://knox.procd.cc/"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0e0f11"/><path d="M11.5 12 16 16l-4.5 4" fill="none" stroke="#edeff1" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="19.5" y="9.8" width="2.1" height="12.4" rx="1.05" fill="#cf7038"/></svg> Knox API</a>`;
}

export function loginPageHtml(opts: { error?: string; sent?: boolean }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Sign in - Knox API</title>${FONT_LINKS}<style>${BASE_STYLE}</style></head>
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
      var input = document.getElementById("email");
      var email = input.value;
      var btn = e.target.querySelector("button");
      var originalLabel = btn.textContent;
      btn.disabled = true;
      input.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Sending...';
      fetch("/auth/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) })
        .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
        .then(function (result) {
          if (result.ok) {
            window.location.href = "/account?sent=1";
            return;
          }
          btn.disabled = false;
          input.disabled = false;
          btn.textContent = originalLabel;
          window.location.href = "/account?error=" + encodeURIComponent((result.body && result.body.error) || "Could not send the link. Try again.");
        })
        .catch(function () {
          btn.disabled = false;
          input.disabled = false;
          btn.textContent = originalLabel;
          window.location.href = "/account?error=" + encodeURIComponent("Could not send the link. Try again.");
        });
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
            ${revoked ? `<span class="key-meta">revoked</span>` : `<button class="btn btn-danger" type="button" data-revoke="${escapeHtml(k.id)}" data-revoke-name="${escapeHtml(k.name)}">Revoke</button>`}
          </div>`;
        })
        .join("")
    : `<p class="sub" style="margin:0">No API keys yet.</p>`;

  const dailyPct = Math.min(100, Math.round((opts.usage.today / opts.usage.dailyCap) * 100));
  const monthlyPct = Math.min(100, Math.round((opts.usage.thisMonth / opts.usage.monthlyCap) * 100));

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Dashboard - Knox API</title>${FONT_LINKS}<style>${BASE_STYLE}</style></head>
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
    <h2>Usage</h2>
    <div class="usage-label"><span>Today</span><span>${opts.usage.today} / ${opts.usage.dailyCap} runs</span></div>
    <div class="usage-bar"><div class="usage-bar-fill" style="width:${dailyPct}%"></div></div>
    <div class="usage-label" style="margin-top:14px;"><span>This month</span><span>${opts.usage.thisMonth} / ${opts.usage.monthlyCap} runs</span></div>
    <div class="usage-bar"><div class="usage-bar-fill" style="width:${monthlyPct}%"></div></div>
  </div>

  <div class="card">
    <h2>API keys</h2>
    ${keyRows}
    <form id="create-key-form" class="row" style="margin-top:16px;">
      <div><label for="key-name">New key name</label><input type="text" id="key-name" placeholder="e.g. laptop, CI" required /></div>
      <button class="btn btn-primary" type="submit">Create key</button>
    </form>
  </div>

  <div class="card">
    <h2>Call the API</h2>
    <pre><span class="tok-c"># python, with numpy/pandas/requests pre-installed</span>
curl https://knox-api.procd.cc/v1/execute \\
  -H <span class="tok-str">"Authorization: Bearer knox_live_..."</span> \\
  -H <span class="tok-str">"Content-Type: application/json"</span> \\
  -d <span class="tok-str">'{"language":"python","filename":"main.py","code":"print(1+1)"}'</span></pre>
    <p class="footer-link" style="margin:12px 0 0;">Languages: python, c, cpp, java, go, rust. Max 2 minutes per run.</p>
  </div>

  <div class="modal-overlay" id="revoke-modal" hidden>
    <div class="modal-card">
      <p class="modal-title">Revoke API key</p>
      <p class="modal-body">Revoke <strong id="revoke-key-name"></strong>? Anything using it will stop working immediately.</p>
      <p class="modal-error" id="revoke-error" hidden></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" id="revoke-cancel">Cancel</button>
        <button class="btn btn-danger-solid" type="button" id="revoke-confirm">Revoke key</button>
      </div>
    </div>
  </div>

  <script>
    document.getElementById("create-key-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nameInput = document.getElementById("key-name");
      var name = nameInput.value;
      var btn = e.target.querySelector("button");
      btn.disabled = true;
      nameInput.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Creating...';
      fetch("/account/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body.key) window.location.href = "/account?minted=" + encodeURIComponent(body.key);
          else window.location.href = "/account?error=" + encodeURIComponent(body.error || "Could not create key");
        })
        .catch(function () {
          btn.disabled = false;
          nameInput.disabled = false;
          btn.textContent = "Create key";
        });
    });

    var revokeModal = document.getElementById("revoke-modal");
    var revokeKeyName = document.getElementById("revoke-key-name");
    var revokeConfirm = document.getElementById("revoke-confirm");
    var revokeCancel = document.getElementById("revoke-cancel");
    var revokeError = document.getElementById("revoke-error");
    var pendingRevokeId = null;

    function closeRevokeModal() {
      revokeModal.hidden = true;
      pendingRevokeId = null;
    }

    document.querySelectorAll("[data-revoke]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pendingRevokeId = btn.getAttribute("data-revoke");
        revokeKeyName.textContent = btn.getAttribute("data-revoke-name");
        revokeError.hidden = true;
        revokeConfirm.disabled = false;
        revokeConfirm.textContent = "Revoke key";
        revokeModal.hidden = false;
      });
    });
    revokeCancel.addEventListener("click", closeRevokeModal);
    revokeModal.addEventListener("click", function (e) {
      if (e.target === revokeModal) closeRevokeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !revokeModal.hidden) closeRevokeModal();
    });
    revokeConfirm.addEventListener("click", function () {
      if (!pendingRevokeId) return;
      revokeConfirm.disabled = true;
      revokeCancel.disabled = true;
      revokeError.hidden = true;
      revokeConfirm.innerHTML = '<span class="spinner"></span>Revoking...';
      fetch("/account/keys/" + pendingRevokeId, { method: "DELETE" })
        .then(function (r) {
          if (!r.ok) throw new Error();
          window.location.reload();
        })
        .catch(function () {
          revokeConfirm.disabled = false;
          revokeCancel.disabled = false;
          revokeConfirm.textContent = "Revoke key";
          revokeError.hidden = false;
          revokeError.textContent = "Could not revoke the key. Try again.";
        });
    });
  </script>
</div></body></html>`;
}
