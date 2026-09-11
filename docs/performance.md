# Performance

SPEC section 32 is explicit: *"Do not claim benchmarks unless measured."* Everything below was captured by scripting Playwright against the actual production Docker image (`infra/Dockerfile`) on 2026-09-11, on a single Apple Silicon Mac via OrbStack - not a cloud VM, not a phone, not under load. Treat these as **a lower bound on real-world numbers**, not a promise. Re-run `scripts/perf-check.mjs` on your own target hardware before citing these numbers anywhere that matters.

## Methodology

1. `docker build -f infra/Dockerfile -t knox:perf .` then `docker run -p 8092:8080 knox:perf`
2. A headless Chromium instance (Playwright) navigates to a fresh context (empty cache/storage) and reads the browser's own `PerformanceNavigationTiming` and paint entries - not `Date.now()` around `page.goto`, which would include Playwright/CDP overhead in the "before first byte" number.
3. For interaction timing, a fresh context repeats the exact vertical slice a first-time user takes: Welcome → New Project → new file → typed content - and wall-clock-times each step with `Date.now()`, which *does* include Playwright/CDP dispatch overhead. These numbers are an upper bound on what a real user sees, not a precise render-latency trace.

## Cold load (empty cache, production container)

| Metric | Value |
|---|---|
| First Paint | 64ms |
| First Contentful Paint | 136ms |
| `domContentLoadedEventEnd` | 80ms |
| `load` event | 83ms |
| Initial HTML transfer size | 961 bytes |

The initial JS entry chunk is ~201KB gzipped (~64KB compressed) - see the bundle table below. Monaco (~847KB gzipped) is not part of this initial load; it loads only once a file is opened, per the code-split described in `docs/architecture.md`.

This meets the SPEC section 32 target ("initial shell render < 100ms where realistic") for paint; DOMContentLoaded/load land just over 80ms on this hardware.

## Vertical slice timing (Welcome → typed code)

| Step | Time |
|---|---|
| Click "New project" → explorer visible | 202ms |
| Create file → tab open | 44ms |
| Tab open → Monaco fully ready (`.view-lines` painted) | 275ms |

The Monaco step is the one to watch: it's the moment `@knox/editor/monaco` downloads, initializes, and creates the first model. 275ms on localhost with no network latency; expect meaningfully more on a cold cache over a real network until the service worker has precached it once (see `docs/architecture.md`).

## Keystroke → DOM update latency

40 sequential keystrokes into an open Monaco buffer, each timed from `keyboard.type` dispatch to the moment the DOM reflects the new character:

| Percentile | Latency |
|---|---|
| p50 | 17ms |
| p95 | 28ms |
| max | 74ms |

SPEC section 32's target is "keystroke → visual update: < 16ms". This measurement is *not* a clean render-latency trace - it includes Playwright's CDP round-trip and a polling `waitForFunction`, both of which add overhead a real keypress doesn't pay. Treat p50 as roughly at-target and p95/max as upper bounds that likely overstate real latency. A proper trace (Chrome DevTools Performance panel, `Long Tasks` API) is the right follow-up before optimizing further - see "Not yet measured" below.

## Bundle sizes (production build)

| Chunk | Raw | Gzip |
|---|---|---|
| App shell (`index-*.js`) | 201KB | 64KB |
| Monaco + TS worker (`monaco-*.js`, lazy) | 3.3MB | 847KB |
| Per-language Monarch grammars (lazy, one per language actually opened) | 1–20KB each | ~1–6KB each |
| Service worker precache manifest | 96 entries, ~12MB total | - |

The 3.3MB Monaco chunk is dominated by the bundled TypeScript compiler (`ts.worker`, ~6MB unminified) - this is inherent to shipping real TS/JS language intelligence in-browser, not something to trim further without losing that intelligence. It loads once, lazily, and is served from the service worker cache on every subsequent visit.

## What's not measured yet

- Large-file behavior (SPEC section 33/106: 1KB/100KB/1MB/10MB/50MB/100MB files) - the thresholds in `packages/editor/src/large-file.ts` are implemented and unit-testable, but not yet benchmarked against real large files.
- Huge-repository behavior (100/1,000/10,000/100,000 files, SPEC section 34/106) - the explorer is virtualized and lazy (only `readdir`s expanded directories), but hasn't been load-tested against a 100k-file synthetic workspace yet.
- Git status time, LSP request latency, search latency - not applicable yet; those packages aren't built (see README Roadmap).
- Memory/CPU under sustained use, worker count, WASM memory - the Developer: Show Performance panel (SPEC section 59) isn't built yet.

Don't cite this document as covering those - it doesn't yet.
