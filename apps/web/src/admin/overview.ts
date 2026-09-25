// knox.procd.cc/admin/ - the admin overview. A static shell: every number comes from two
// admin-only endpoints, each enforcing sign-in + admin server-side, so this page itself holds
// nothing worth protecting.
//   - VS Code sessions: session-broker's /api/sessions/admin/overview, same-origin through
//     infra/nginx.conf's /api/sessions proxy.
//   - Accounts and code runs: apps/api's /admin/overview, cross-origin with credentials on the
//     hosted deployment (knox-api.procd.cc), or same-origin through the dev server's /__account
//     proxy locally (see vite.config.ts).

interface SessionsOverview {
  generatedAt: string;
  dailyCapMinutes: number;
  live: Array<{ id: string; login: string | null; startedAt: string; expiresAt: string; bootMs: number | null }>;
  totals: { sessionsToday: number; sessions7d: number; minutesToday: number; minutes7d: number; usersToday: number; users7d: number; avgSessionMinutes7d: number | null };
  funnel7d: { requested: number; started: number; resumed: number; limitDaily: number; limitActive: number; failed: number };
  endReasons7d: { expired: number; ended: number };
  bootMs7d: { p50: number | null; p95: number | null };
  daily30d: Array<{ day: string; sessions: number; minutes: number; users: number }>;
  topUsers7d: Array<{ login: string | null; minutes: number; sessions: number }>;
  recent: Array<{ login: string | null; startedAt: string; minutes: number; bootMs: number | null; endReason: string | null; live: boolean }>;
  recentFailures: Array<{ login: string | null; at: string; detail: string | null }>;
}

interface ApiOverview {
  generatedAt: string;
  users: { total: number; new7d: number; new30d: number; signedIn7d: number; recentSignups: Array<{ login: string | null; name: string | null; avatarUrl: string | null; createdAt: string }> };
  executions: {
    today: number;
    last7d: number;
    last30d: number;
    succeeded7d: number;
    completed7d: number;
    p50Ms7d: number | null;
    p95Ms7d: number | null;
    byLanguage7d: Array<{ language: string; runs: number; failed: number }>;
    bySource7d: { api: number; ide: number };
    daily30d: Array<{ day: string; api: number; ide: number; failed: number }>;
    topUsers7d: Array<{ login: string | null; avatarUrl: string | null; runs: number }>;
  };
  apiKeys: { active: number; createdLast7d: number };
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const HOSTED = location.hostname === "procd.cc" || location.hostname.endsWith(".procd.cc");
const ACCOUNT_API = HOSTED ? "https://knox-api.procd.cc" : "/__account";
const SIGN_IN_URL = `${HOSTED ? ACCOUNT_API : ""}/auth/github?redirect=${encodeURIComponent(`${location.origin}/admin/`)}`;
const REFRESH_MS = 30_000;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- formatting ------------------------------------------------------------------------------

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const nf = new Intl.NumberFormat("en-US");
const fmtInt = (n: number) => (Math.abs(n) >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : nf.format(n));
function fmtMinutes(min: number): string {
  if (min < 60) return `${nf.format(Math.round(min))} min`;
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : h.toFixed(1)} h`;
}
function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function fmtAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));
const person = (login: string | null) => (login ? `@${esc(login)}` : "unknown");
const initial = (name: string | null) => `<span class="avatar-fallback" aria-hidden="true">${esc((name ?? "?").replace(/^@/, "").charAt(0).toUpperCase())}</span>`;
const sized = (url: string, px: number) => `${url}${url.includes("?") ? "&" : "?"}s=${px}`;

// ---- data ------------------------------------------------------------------------------------

async function getJson<T>(url: string, cross: boolean): Promise<Result<T>> {
  try {
    const res = await fetch(url, { credentials: cross ? "include" : "same-origin", cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) return { ok: false, status: res.status, error: body?.error ?? `HTTP ${res.status}` };
    if (!body) return { ok: false, status: res.status, error: "Empty response" };
    return { ok: true, data: body };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the service." };
  }
}

// ---- charts ----------------------------------------------------------------------------------

interface Series {
  key: string;
  label: string;
  color: string; // a CSS variable reference - resolved by the browser, so theme switches just work
  values: number[];
}

/** Nice round ticks from 0 to at least `max` - never a fractional count on an axis of counts. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough && Number.isInteger(s)) ?? Math.ceil(rough);
  const out = [];
  for (let v = 0; v < max + step; v += step) out.push(v);
  return out;
}

function columnChart(host: HTMLElement, days: string[], series: Series[], opts: { unit: (n: number) => string; tooltip: (i: number) => string; tableHead: string[]; tableRow: (i: number) => string[] }): void {
  const height = 220;
  const pad = { top: 18, right: 4, bottom: 26, left: 40 };
  const totals = days.map((_, i) => series.reduce((sum, s) => sum + s.values[i]!, 0));
  const yTicks = ticks(Math.max(...totals));
  const yMax = yTicks[yTicks.length - 1]!;
  const peak = totals.indexOf(Math.max(...totals));

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.hidden = true;

  const render = () => {
    const width = Math.max(280, host.clientWidth);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const band = plotW / days.length;
    const barW = Math.min(24, Math.max(3, band * 0.62));
    const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;
    const parts: string[] = [];

    for (const t of yTicks) {
      parts.push(`<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>`);
      parts.push(`<text class="tick" x="${pad.left - 8}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmtInt(t))}</text>`);
    }
    // Weekly x labels, always including the latest day, skipping any that would crowd it.
    const last = days.length - 1;
    days.forEach((day, i) => {
      if ((last - i) % 7 !== 0) return;
      if (i !== last && band * (last - i) < 44) return;
      parts.push(`<text class="tick" x="${pad.left + band * i + band / 2}" y="${height - 6}" text-anchor="middle">${esc(fmtDay(day))}</text>`);
    });

    days.forEach((_, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      parts.push(`<rect class="band" data-i="${i}" x="${pad.left + band * i}" y="${pad.top}" width="${band}" height="${plotH}"/>`);
      let base = 0;
      const drawn = series.filter((s) => s.values[i]! > 0);
      drawn.forEach((s, j) => {
        const v = s.values[i]!;
        // A 2px surface gap separates stacked segments; only the top one gets a rounded end,
        // and the bottom one sits square on the baseline.
        const bottom = y(base) - (j > 0 ? 2 : 0);
        const h = Math.max(1, bottom - y(base + v));
        const r = j === drawn.length - 1 ? Math.min(4, barW / 2, h) : 0;
        const yTop = bottom - h;
        parts.push(
          `<path fill="${s.color}" pointer-events="none" d="M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yTop + h} Z"/>`,
        );
        base += v;
      });
    });
    if (totals[peak]! > 0) {
      parts.push(`<text class="tick peak" x="${pad.left + band * peak + band / 2}" y="${y(totals[peak]!) - 6}" text-anchor="middle">${esc(opts.unit(totals[peak]!))}</text>`);
    }

    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${esc(host.dataset.label ?? "")}">${parts.join("")}</svg>`;
    host.appendChild(tooltip);
    host.appendChild(table);

    const svg = host.querySelector("svg")!;
    let active: SVGRectElement | null = null;
    const show = (rect: SVGRectElement) => {
      active?.classList.remove("is-hover");
      active = rect;
      rect.classList.add("is-hover");
      const i = Number(rect.dataset.i);
      tooltip.innerHTML = opts.tooltip(i);
      tooltip.hidden = false;
      const bandX = (pad.left + band * i + band / 2) * (svg.clientWidth / width);
      const left = Math.min(Math.max(0, bandX - tooltip.offsetWidth / 2), host.clientWidth - tooltip.offsetWidth);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(0, y(totals[i]!) - tooltip.offsetHeight - 10)}px`;
    };
    svg.addEventListener("pointermove", (e) => {
      const target = e.target as Element;
      if (target instanceof SVGRectElement && target.classList.contains("band") && target !== active) show(target);
    });
    svg.addEventListener("pointerleave", () => {
      active?.classList.remove("is-hover");
      active = null;
      tooltip.hidden = true;
    });
  };

  // The same numbers as a table, for screen readers and anyone who wants exact values.
  const table = document.createElement("details");
  table.className = "table-toggle";
  table.innerHTML = `<summary>View as table</summary><div class="scroll-x" style="margin-top:10px"><table><thead><tr>${opts.tableHead
    .map((h, i) => `<th${i ? ' class="num"' : ""}>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${days
    .map((_, i) => `<tr>${opts.tableRow(i).map((c, j) => `<td${j ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`)
    .reverse()
    .join("")}</tbody></table></div>`;

  render();
  const ro = new ResizeObserver(() => {
    const wasOpen = table.open;
    render();
    table.open = wasOpen;
  });
  ro.observe(host);
  charts.push(ro);
}

function hbars(rows: Array<{ label: string; value: number; muted?: boolean; title?: string }>): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="hbars">${rows
    .map(
      (r) => `<div class="hbar"${r.title ? ` title="${esc(r.title)}"` : ""}>
        <span class="hbar-label">${esc(r.label)}</span>
        <span class="hbar-track"><span class="hbar-fill${r.muted ? " is-muted" : ""}" style="width:${(r.value / max) * 100}%"></span></span>
        <span class="hbar-value">${esc(fmtInt(r.value))}</span>
      </div>`,
    )
    .join("")}</div>`;
}

let charts: ResizeObserver[] = [];

// ---- sections --------------------------------------------------------------------------------

function renderSessions(r: Result<SessionsOverview>): void {
  const errorHtml = (what: string) => `<p class="panel-error">Couldn't load ${what}: ${esc(r.ok ? "" : r.error)}</p>`;
  if (!r.ok) {
    $("live-count").textContent = "-";
    $("live-label").textContent = "";
    $("live-list").innerHTML = errorHtml("live sessions");
    $("minutes-chart").innerHTML = errorHtml("VS Code usage");
    $("funnel").innerHTML = errorHtml("launches");
    $("top-users").innerHTML = errorHtml("VS Code usage");
    $("recent").innerHTML = errorHtml("sessions");
    $("failures").innerHTML = errorHtml("failures");
    return;
  }
  const d = r.data;

  // Hero: the one live number, plus who's in there right now.
  $("live-count").textContent = String(d.live.length);
  $("live-label").textContent = d.live.length === 1 ? "session open" : "sessions open";
  $("live-sub").textContent = `${fmtInt(d.totals.sessionsToday)} started today by ${fmtInt(d.totals.usersToday)} ${d.totals.usersToday === 1 ? "person" : "people"}`;
  renderLive(d);

  const minutes = d.daily30d.map((x) => x.minutes);
  const host = $("minutes-chart");
  host.dataset.label = "VS Code minutes per day, last 30 days";
  columnChart(host, d.daily30d.map((x) => x.day), [{ key: "minutes", label: "Minutes", color: "var(--series-1)", values: minutes }], {
    unit: (n) => `${fmtInt(n)} min`,
    tooltip: (i) => {
      const x = d.daily30d[i]!;
      return `<div class="tooltip-title">${esc(fmtDay(x.day))}</div>
        <div class="tooltip-row"><span><i class="key" style="background:var(--series-1)"></i>Minutes</span><strong>${esc(fmtMinutes(x.minutes))}</strong></div>
        <div class="tooltip-row"><span>Sessions</span><span>${esc(fmtInt(x.sessions))}</span></div>
        <div class="tooltip-row"><span>People</span><span>${esc(fmtInt(x.users))}</span></div>`;
    },
    tableHead: ["Day (UTC)", "Minutes", "Sessions", "People"],
    tableRow: (i) => {
      const x = d.daily30d[i]!;
      return [x.day, String(x.minutes), String(x.sessions), String(x.users)];
    },
  });

  const f = d.funnel7d;
  $("funnel").innerHTML =
    f.requested === 0
      ? `<p class="empty">No one has clicked Open Knox in the last 7 days.</p>`
      : `${hbars([
          { label: "Clicked Open Knox", value: f.requested },
          { label: "Got a new session", value: f.started },
          { label: "Resumed a running one", value: f.resumed },
          { label: "Hit the daily limit", value: f.limitDaily, muted: true },
          { label: "Browser already in use", value: f.limitActive, muted: true, title: "This browser already had a session open, under another account" },
          { label: "Failed to start", value: f.failed, muted: true },
        ])}
        <div class="facts">
          <div class="fact"><strong>${esc(fmtMs(d.bootMs7d.p50))}</strong><span>typical boot (p50)</span></div>
          <div class="fact"><strong>${esc(fmtMs(d.bootMs7d.p95))}</strong><span>slow boot (p95)</span></div>
          <div class="fact"><strong>${d.totals.avgSessionMinutes7d == null ? "-" : esc(`${d.totals.avgSessionMinutes7d} min`)}</strong><span>average session</span></div>
          <div class="fact"><strong>${esc(fmtInt(d.endReasons7d.ended))} / ${esc(fmtInt(d.endReasons7d.expired))}</strong><span>ended early / ran out</span></div>
        </div>`;

  $("top-users").innerHTML = d.topUsers7d.length
    ? d.topUsers7d
        .map((u) => `<div class="person">${initial(u.login)}<span class="name">${person(u.login)}</span><span class="meta">${esc(fmtMinutes(u.minutes))} · ${esc(fmtInt(u.sessions))} ${u.sessions === 1 ? "session" : "sessions"}</span></div>`)
        .join("")
    : `<p class="empty">No sessions in the last 7 days.</p>`;
  // Avatars come from the accounts side, when it's loaded - matched by login.
  decorateAvatars();

  $("recent").innerHTML = d.recent.length
    ? `<table><thead><tr><th>Who</th><th>Started</th><th class="num">Length</th><th class="num">Boot</th><th>Status</th></tr></thead><tbody>${d.recent
        .map(
          (s) => `<tr><td>${person(s.login)}</td><td title="${esc(new Date(s.startedAt).toLocaleString())}">${esc(fmtAgo(s.startedAt))}</td><td class="num">${esc(fmtMinutes(s.minutes))}</td><td class="num">${esc(fmtMs(s.bootMs))}</td><td>${
            s.live ? `<span class="pill is-live">Running</span>` : `<span class="pill">${s.endReason === "ended" ? "Ended early" : s.endReason === "expired" ? "Ran out" : "Stopped"}</span>`
          }</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">No sessions yet.</p>`;

  $("failures").innerHTML = d.recentFailures.length
    ? d.recentFailures.map((x) => `<div class="failure"><strong>${person(x.login)}</strong> <span class="tile-sub">${esc(fmtAgo(x.at))}</span><code>${esc(x.detail ?? "No detail recorded")}</code></div>`).join("")
    : `<p class="empty">None recorded. Every launch became reachable.</p>`;
}

let lastSessions: SessionsOverview | null = null;
function renderLive(d: SessionsOverview): void {
  lastSessions = d;
  const list = $("live-list");
  if (!d.live.length) {
    list.innerHTML = `<p class="empty">Nobody's in a session right now. ${esc(fmtInt(d.totals.sessions7d))} ${d.totals.sessions7d === 1 ? "session" : "sessions"} in the last 7 days.</p>`;
    return;
  }
  list.innerHTML = d.live
    .map((s) => {
      const start = new Date(s.startedAt).getTime();
      const end = new Date(s.expiresAt).getTime();
      const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
      return `<div class="live-row">
        <span class="who"><span class="dot-live" aria-hidden="true"></span><strong>${person(s.login)}</strong></span>
        <span class="meter" role="img" aria-label="${Math.round(pct)}% of this session used"><span style="width:${pct}%"></span></span>
        <span class="live-meta">${esc(fmtClock(end - Date.now()))} left · booted in ${esc(fmtMs(s.bootMs))}</span>
      </div>`;
    })
    .join("");
}

let avatarsByLogin = new Map<string, string>();
function decorateAvatars(): void {
  document.querySelectorAll<HTMLElement>("#top-users .person").forEach((row) => {
    const login = row.querySelector(".name")?.textContent?.replace(/^@/, "") ?? "";
    const url = avatarsByLogin.get(login);
    const slot = row.querySelector(".avatar-fallback");
    if (url && slot) slot.outerHTML = `<img src="${esc(sized(url, 52))}" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" />`;
  });
}

function renderAccounts(r: Result<ApiOverview>, s: Result<SessionsOverview>): void {
  const tiles: Array<{ label: string; value: string; sub: string }> = [];
  const sess = s.ok ? s.data : null;
  const api = r.ok ? r.data : null;

  if (sess) {
    tiles.push({ label: "VS Code today", value: fmtMinutes(sess.totals.minutesToday), sub: `${fmtMinutes(sess.totals.minutes7d)} in 7 days` });
    tiles.push({ label: "Sessions today", value: fmtInt(sess.totals.sessionsToday), sub: `${fmtInt(sess.totals.sessions7d)} in 7 days` });
    tiles.push({ label: "People coding, 7 days", value: fmtInt(sess.totals.users7d), sub: `${fmtInt(sess.totals.usersToday)} today` });
  }
  if (api) {
    const e = api.executions;
    tiles.push({ label: "Accounts", value: fmtInt(api.users.total), sub: `+${fmtInt(api.users.new7d)} in 7 days` });
    tiles.push({ label: "Code runs today", value: fmtInt(e.today), sub: `${fmtInt(e.last7d)} in 7 days` });
    const rate = e.completed7d ? Math.round((e.succeeded7d / e.completed7d) * 100) : null;
    tiles.push({ label: "Runs that exit 0", value: rate == null ? "-" : `${rate}%`, sub: e.p50Ms7d == null ? "7 days" : `p50 ${fmtMs(e.p50Ms7d)} · p95 ${fmtMs(e.p95Ms7d)}` });
  }
  $("tiles").innerHTML = tiles
    .map((t) => `<div class="tile"><div class="tile-label">${esc(t.label)}</div><div class="tile-value">${esc(t.value)}</div><div class="tile-sub">${esc(t.sub)}</div></div>`)
    .join("");
  if (!r.ok) {
    $("tiles").insertAdjacentHTML("beforeend", `<div class="tile"><div class="tile-label">Accounts and runs</div><p class="panel-error" style="margin-top:8px">${esc(r.error)}</p></div>`);
    const msg = `<p class="panel-error">Couldn't load accounts and runs: ${esc(r.error)}</p>`;
    $("runs-chart").innerHTML = msg;
    $("languages").innerHTML = msg;
    $("signups").innerHTML = msg;
    return;
  }
  const d = r.data;
  avatarsByLogin = new Map(d.users.recentSignups.concat(d.executions.topUsers7d.map((u) => ({ login: u.login, name: null, avatarUrl: u.avatarUrl, createdAt: "" }))).filter((u) => u.login && u.avatarUrl).map((u) => [u.login!, u.avatarUrl!]));
  decorateAvatars();

  const days = d.executions.daily30d;
  const runsHost = $("runs-chart");
  runsHost.dataset.label = "Code runs per day by source, last 30 days";
  columnChart(
    runsHost,
    days.map((x) => x.day),
    [
      { key: "api", label: "API", color: "var(--series-1)", values: days.map((x) => x.api) },
      { key: "ide", label: "IDE", color: "var(--series-2)", values: days.map((x) => x.ide) },
    ],
    {
      unit: (n) => fmtInt(n),
      tooltip: (i) => {
        const x = days[i]!;
        return `<div class="tooltip-title">${esc(fmtDay(x.day))}</div>
          <div class="tooltip-row"><span><i class="key" style="background:var(--series-1)"></i>API</span><strong>${esc(fmtInt(x.api))}</strong></div>
          <div class="tooltip-row"><span><i class="key" style="background:var(--series-2)"></i>IDE</span><strong>${esc(fmtInt(x.ide))}</strong></div>
          <div class="tooltip-row"><span>Didn't exit 0</span><span>${esc(fmtInt(x.failed))}</span></div>`;
      },
      tableHead: ["Day (UTC)", "API", "IDE", "Didn't exit 0"],
      tableRow: (i) => {
        const x = days[i]!;
        return [x.day, String(x.api), String(x.ide), String(x.failed)];
      },
    },
  );

  const langs = d.executions.byLanguage7d;
  $("languages").innerHTML = langs.length
    ? hbars(langs.map((l) => ({ label: l.language, value: l.runs, title: `${l.runs} runs, ${l.failed} didn't exit 0` })))
    : `<p class="empty">No code runs in the last 7 days.</p>`;

  $("signups-sub").textContent = `${fmtInt(d.users.new7d)} in 7 days, ${fmtInt(d.users.new30d)} in 30. ${fmtInt(d.users.signedIn7d)} signed in this week.`;
  $("signups").innerHTML = d.users.recentSignups.length
    ? d.users.recentSignups
        .map(
          (u) => `<div class="person">${u.avatarUrl ? `<img src="${esc(sized(u.avatarUrl, 52))}" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" />` : initial(u.login ?? u.name)}<span class="name">${u.login ? `@${esc(u.login)}` : esc(u.name ?? "Email account")}</span><span class="meta" title="${esc(new Date(u.createdAt).toLocaleString())}">${esc(fmtAgo(u.createdAt))}</span></div>`,
        )
        .join("")
    : `<p class="empty">No accounts yet.</p>`;
}

// ---- gate + refresh loop ---------------------------------------------------------------------

function showGate(title: string, text: string, action?: { label: string; href: string }): void {
  $("dashboard").hidden = true;
  $("bar-right").hidden = true;
  $("gate").hidden = false;
  $("gate-title").textContent = title;
  $("gate-text").textContent = text;
  const a = $<HTMLAnchorElement>("gate-action");
  a.hidden = !action;
  if (action) {
    a.textContent = action.label;
    a.href = action.href;
  }
}

let lastSuccess = 0;
let inFlight = false;

async function refresh(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  $("refresh").classList.add("is-spinning");
  const [sessions, accounts, me] = await Promise.all([
    getJson<SessionsOverview>("/api/sessions/admin/overview", false),
    getJson<ApiOverview>(`${ACCOUNT_API}/admin/overview`, HOSTED),
    lastSuccess ? Promise.resolve(null) : getJson<{ avatarUrl: string | null; login: string | null }>(`${ACCOUNT_API}/auth/me`, HOSTED),
  ]);
  inFlight = false;
  $("refresh").classList.remove("is-spinning");

  const statuses = [sessions, accounts].map((r) => (r.ok ? 200 : r.status));
  if (statuses.includes(401)) {
    showGate("Sign in to see the overview", "It's only visible to this deployment's admins.", { label: "Continue with GitHub", href: SIGN_IN_URL });
    return;
  }
  if (statuses.includes(403)) {
    showGate("This page is for admins", "Your account is signed in, but it isn't listed as an admin on this deployment.", { label: "Back to Knox", href: "/" });
    return;
  }
  if (!sessions.ok && !accounts.ok && !lastSuccess) {
    showGate("The overview isn't available here", "Neither the session service nor the account service answered. A self-hosted Knox without accounts has no overview.", { label: "Back to Knox", href: "/" });
    return;
  }

  $("gate").hidden = true;
  $("dashboard").hidden = false;
  $("bar-right").hidden = false;
  if (me && me.ok && me.data.avatarUrl) {
    $<HTMLImageElement>("me-avatar").src = sized(me.data.avatarUrl, 56);
    $("me").title = me.data.login ? `Signed in as @${me.data.login}` : "Your account";
    if (!HOSTED) $<HTMLAnchorElement>("me").href = "#";
  }

  charts.forEach((ro) => ro.disconnect());
  charts = [];
  renderSessions(sessions);
  renderAccounts(accounts, sessions);

  if (sessions.ok || accounts.ok) lastSuccess = Date.now();
  const stale = !sessions.ok || !accounts.ok;
  $("pulse").classList.toggle("is-stale", stale);
  updateStamp();
}

function updateStamp(): void {
  if (!lastSuccess) return;
  const s = Math.round((Date.now() - lastSuccess) / 1000);
  $("updated").textContent = s < 5 ? "Updated just now" : `Updated ${s < 60 ? `${s}s` : `${Math.floor(s / 60)} min`} ago`;
}

$("refresh").addEventListener("click", () => void refresh());

// Poll only while the tab is visible - a background tab has nobody to show numbers to.
let timer: number | undefined;
function schedule(): void {
  window.clearInterval(timer);
  if (document.visibilityState === "visible") timer = window.setInterval(() => void refresh(), REFRESH_MS);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastSuccess > REFRESH_MS) void refresh();
  schedule();
});
// Live rows count down between refreshes, and the "updated" stamp ages, without a refetch.
window.setInterval(() => {
  if (lastSessions && document.visibilityState === "visible") renderLive(lastSessions);
  updateStamp();
}, 1000);

void refresh();
schedule();
