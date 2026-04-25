// fullpage.mjs — full viewport screenshot of each target, after animations settle.
//
// Usage:
//   node scripts/visual-diff/fullpage.mjs [--theme=dark|light]
//                                         [--new=<url>] [--old=<url>]
//                                         [--viewport=1280x900]
//
// Output: scripts/visual-diff/out/full-{label}-{theme}.png

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
const NEW_URL = args.new || "http://localhost:8000/index.html";
const OLD_URL = args.old || "http://localhost:8001/public/index.html";
const [vpW, vpH] = (args.viewport || "1280x900").split("x").map(Number);

async function isReachable(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function setTheme(ctx, mode) {
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem("theme", m);
    } catch {}
  }, mode);
}

(async () => {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const targets = [];
  if (await isReachable(NEW_URL)) targets.push({ label: "new", url: NEW_URL });
  else console.warn(`warning: ${NEW_URL} unreachable`);
  if (await isReachable(OLD_URL)) targets.push({ label: "old", url: OLD_URL });
  else console.warn(`note: ${OLD_URL} unreachable — skipping`);
  if (!targets.length) process.exit(1);

  const browser = await chromium.launch();
  for (const target of targets) {
    const ctx = await browser.newContext({ viewport: { width: vpW, height: vpH } });
    await setTheme(ctx, THEME);
    const page = await ctx.newPage();
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {}
    await page.waitForTimeout(2500); // let the blink animation finish
    const outPath = path.join(OUT_DIR, `full-${target.label}-${THEME}.png`);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: vpW, height: vpH } });
    console.log(`${target.label}: ${outPath}`);
    await ctx.close();
  }
  await browser.close();
})();
