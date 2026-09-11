/**
 * Verifies the offline claim in docs/local-runtime.md: load once online
 * (populating the service worker precache), create+save a file, go
 * offline, reload, and confirm the workspace and file content survive.
 *
 *   docker build -f infra/Dockerfile -t knox:perf .
 *   docker run -d --rm -p 8093:8080 knox:perf
 *   npm install playwright && npx playwright install chromium
 *   KNOX_URL=http://localhost:8093 node scripts/offline-check.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.KNOX_URL ?? "http://localhost:8093";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext();
const page = await context.newPage();

console.log("--- first load (populate SW cache) ---");
await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
await page.waitForSelector("text=Your code stays on your device by default.");

// Wait for the service worker to actually finish installing + precaching.
await page.waitForFunction(
  async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg && !!reg.active;
  },
  { timeout: 20000 },
);
console.log("service worker active");

// Create a workspace + file while still online so there's state to restore.
await page.click('button:has-text("New project")');
await page.waitForSelector(".knox-explorer");
await page.click('button[title="New File"]');
await page.fill(".knox-tree-input", "offline.ts");
await page.press(".knox-tree-input", "Enter");
await page.waitForSelector(".monaco-editor .view-lines");
await page.click(".monaco-editor");
await page.keyboard.type('console.log("offline works");');
await page.keyboard.press("Meta+s");
await page.keyboard.press("Control+s");
await page.waitForTimeout(500);
console.log("workspace + file created and saved while online");

console.log("--- going offline ---");
await context.setOffline(true);

console.log("--- reload with network disconnected ---");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let navFailed = false;
try {
  await page.reload({ waitUntil: "load", timeout: 15000 });
} catch (e) {
  navFailed = true;
  console.log("RELOAD FAILED:", e.message);
}

if (!navFailed) {
  await page.waitForSelector(".knox-explorer", { timeout: 15000 });
  const treeText = await page.textContent(".knox-explorer__tree");
  console.log("OFFLINE RELOAD OK. Tree contents:", treeText);

  await page.click("text=offline.ts");
  await page.waitForSelector(".monaco-editor .view-lines");
  const content = await page.textContent(".monaco-editor .view-lines");
  console.log("File content after offline reload:", content);
} else {
  console.log("Offline reload did NOT work - app requires network on reload.");
}

console.log("console errors:", JSON.stringify(errors));

await browser.close();
