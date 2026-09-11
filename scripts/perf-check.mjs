/**
 * Reproduces the numbers in docs/performance.md. Run against a built
 * production container:
 *
 *   docker build -f infra/Dockerfile -t knox:perf .
 *   docker run -d --rm -p 8092:8080 knox:perf
 *   npm install playwright && npx playwright install chromium
 *   KNOX_URL=http://localhost:8092 node scripts/perf-check.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.KNOX_URL ?? "http://localhost:8092";
const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function measureColdLoad() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.waitForSelector("text=Your code stays on your device by default.");
  const nav = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType("navigation");
    const paint = performance.getEntriesByType("paint");
    return {
      domContentLoaded: entry.domContentLoadedEventEnd,
      loadEvent: entry.loadEventEnd,
      transferSize: entry.transferSize,
      firstPaint: paint.find((p) => p.name === "first-paint")?.startTime,
      firstContentfulPaint: paint.find((p) => p.name === "first-contentful-paint")?.startTime,
    };
  });
  await context.close();
  return nav;
}

async function measureWorkspaceToInteractive() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.waitForSelector('button:has-text("New project")');
  const t0 = Date.now();
  await page.click('button:has-text("New project")');
  await page.waitForSelector(".knox-explorer");
  const t1 = Date.now();
  await page.click('button[title="New File"]');
  await page.fill(".knox-tree-input", "perf.ts");
  await page.press(".knox-tree-input", "Enter");
  const t2 = Date.now();
  await page.waitForSelector(".monaco-editor .view-lines");
  const t3 = Date.now();
  await context.close();
  return {
    welcomeToExplorer_ms: t1 - t0,
    fileCreateToTabOpen_ms: t2 - t1,
    tabOpenToMonacoReady_ms: t3 - t2,
  };
}

async function measureTypingLatency() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await page.waitForSelector('button:has-text("New project")');
  await page.click('button:has-text("New project")');
  await page.waitForSelector(".knox-explorer");
  await page.click('button[title="New File"]');
  await page.fill(".knox-tree-input", "typing.ts");
  await page.press(".knox-tree-input", "Enter");
  await page.waitForSelector(".monaco-editor .view-lines");
  await page.click(".monaco-editor");
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const start = Date.now();
    await page.keyboard.type("x", { delay: 0 });
    // Wait for the DOM to actually reflect the new character.
    await page.waitForFunction(
      (expected) => document.querySelector(".monaco-editor .view-lines")?.textContent?.length === expected,
      i + 1,
      { timeout: 2000 },
    );
    samples.push(Date.now() - start);
  }
  await context.close();
  samples.sort((a, b) => a - b);
  return {
    samples_n: samples.length,
    p50_ms: samples[Math.floor(samples.length * 0.5)],
    p95_ms: samples[Math.floor(samples.length * 0.95)],
    max_ms: samples[samples.length - 1],
  };
}

const cold = await measureColdLoad();
console.log("COLD LOAD (production container, cache empty):", JSON.stringify(cold, null, 2));

const flow = await measureWorkspaceToInteractive();
console.log("VERTICAL SLICE TIMING:", JSON.stringify(flow, null, 2));

const typing = await measureTypingLatency();
console.log("KEYSTROKE -> DOM UPDATE LATENCY (headless, 40 samples):", JSON.stringify(typing, null, 2));

await browser.close();
