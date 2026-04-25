// realtime.mjs — screenshot the hero at real page-load timestamps (no seek).
//
// Use this to verify the blink animation is actually perceivable to a user who
// loads the page normally (as opposed to the seeked captures in capture.mjs).
//
// Usage:
//   node scripts/visual-diff/realtime.mjs [--theme=dark|light] [--url=<url>]
//
// Output: scripts/visual-diff/out/realtime-{theme}-t{ms}.png

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^-+/, "").split("=");
    return [k, v];
  }),
);
const THEME = args.theme === "light" ? "light" : "dark";
const URL = args.url || "http://localhost:8000/index.html";
// Timestamps measured from `page.goto` return (i.e. document loaded)
const TIMESTAMPS = [0, 100, 300, 500, 800, 1100, 1400, 1800, 2300, 2800, 3400];

async function setTheme(ctx, mode) {
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem("theme", m);
    } catch {}
  }, mode);
}

(async () => {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const ms of TIMESTAMPS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await setTheme(ctx, THEME);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Do NOT wait for networkidle — we want to catch the animation as it plays
    // relative to the DOMContentLoaded moment.
    if (ms > 0) await page.waitForTimeout(ms);
    const locator = page.locator(".hero-prompt-banner").first();
    const path_ = path.join(OUT_DIR, `realtime-${THEME}-t${ms}.png`);
    const exists = await locator.count();
    if (exists > 0) {
      await locator.screenshot({ path: path_ });
    } else {
      await page.screenshot({ path: path_, clip: { x: 0, y: 0, width: 1280, height: 400 } });
    }
    console.log(`t=${ms}ms`);
    await ctx.close();
  }
  await browser.close();
  console.log(`\nwrote ${OUT_DIR}/realtime-${THEME}-t*.png`);
})();
