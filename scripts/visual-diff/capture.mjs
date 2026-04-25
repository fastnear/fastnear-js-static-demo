// capture.mjs — animation-seeked hero screenshots + computed-styles JSON.
//
// Usage:
//   node scripts/visual-diff/capture.mjs [--theme=dark|light]
//                                        [--new=<url>] [--old=<url>]
//                                        [--viewport=1280x900]
//                                        [--target=<name>]
//
// Defaults:
//   --theme=dark
//   --new=http://localhost:8000/index.html        (served from public/)
//   --old=http://localhost:8001/public/index.html  (served from repo root — old commits)
//   --viewport=1280x900
//
// Output: scripts/visual-diff/out/hero-{label}-t{ms}.png + report-{theme}.json

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
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
const TIMESTAMPS_MS = [0, 250, 500, 1000, 1500, 2000, 2500];

const KNOWN_TARGETS = {
  new: {
    label: "new",
    url: NEW_URL,
    heroSelector: ".hero-prompt-banner",
    textSelector: ".hero-prompt",
    cursorHost: ".hero-prompt",
    container: ".hero-prompt-banner",
  },
  old: {
    label: "old",
    url: OLD_URL,
    heroSelector: ".bg-near-white",
    textSelector: ".near-cursor",
    cursorHost: ".near-cursor",
    container: ".bg-near-white",
  },
};

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

async function captureFrames(browser, target) {
  const frames = [];
  for (const ms of TIMESTAMPS_MS) {
    const ctx = await browser.newContext({ viewport: { width: vpW, height: vpH } });
    await setTheme(ctx, THEME);
    const page = await ctx.newPage();
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {}
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });

    // Seek the cursor animation to `ms` via Web Animations API so mid-animation
    // frames are reproducible (networkidle can eat more time than the whole 2s).
    const seeked = await page.evaluate(
      ({ selector, targetMs }) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, reason: "no host element" };
        const anims = el.getAnimations({ subtree: true });
        const cursorAnim = anims.find(
          (a) => a.animationName === "blink-cursor" || a.animationName === "hero-prompt-blink",
        );
        if (!cursorAnim) {
          return { ok: false, reason: "no cursor animation", found: anims.map((a) => a.animationName) };
        }
        cursorAnim.pause();
        cursorAnim.currentTime = targetMs;
        return { ok: true, name: cursorAnim.animationName, currentTime: cursorAnim.currentTime };
      },
      { selector: target.cursorHost, targetMs: ms },
    );
    await page.waitForTimeout(50);

    const locator = page.locator(target.heroSelector).first();
    const exists = await locator.count();
    const outPath = path.join(OUT_DIR, `hero-${target.label}-t${ms}.png`);
    if (exists > 0) {
      await locator.screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: vpW, height: 520 } });
    }
    frames.push({ ms, path: outPath, seeked });
    await ctx.close();
  }
  return frames;
}

async function measureStyles(browser, target) {
  const ctx = await browser.newContext({ viewport: { width: vpW, height: vpH } });
  await setTheme(ctx, THEME);
  const page = await ctx.newPage();
  await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {}
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(100);

  const measured = await page.evaluate(
    ({ textSel, cursorHostSel, containerSel }) => {
      const pick = (el, keys) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        for (const k of keys) out[k] = cs.getPropertyValue(k);
        out.tagName = el.tagName.toLowerCase();
        out.className = el.className.toString();
        const rect = el.getBoundingClientRect();
        out.rect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        return out;
      };
      const pickAfter = (el, keys) => {
        if (!el) return null;
        const cs = getComputedStyle(el, "::after");
        const out = {};
        for (const k of keys) out[k] = cs.getPropertyValue(k);
        return out;
      };

      const textKeys = [
        "font-size",
        "font-weight",
        "font-family",
        "line-height",
        "letter-spacing",
        "color",
        "margin-top",
        "margin-bottom",
        "padding",
      ];
      const afterKeys = [
        "width",
        "height",
        "margin-left",
        "vertical-align",
        "background-color",
        "background-image",
        "transform",
        "opacity",
        "animation-duration",
        "animation-timing-function",
        "animation-iteration-count",
        "animation-fill-mode",
        "animation-name",
        "border",
        "border-radius",
      ];
      const containerKeys = [
        "background-color",
        "padding",
        "margin",
        "border",
        "border-radius",
        "box-shadow",
      ];

      const text = document.querySelector(textSel);
      const cursorHost = document.querySelector(cursorHostSel);
      const container = document.querySelector(containerSel);
      const bodyCs = getComputedStyle(document.body);

      return {
        text: pick(text, textKeys),
        cursorAfter: pickAfter(cursorHost, afterKeys),
        container: pick(container, containerKeys),
        body: {
          "background-color": bodyCs.getPropertyValue("background-color"),
          color: bodyCs.getPropertyValue("color"),
          "font-family": bodyCs.getPropertyValue("font-family"),
        },
        root: { classList: Array.from(document.documentElement.classList) },
      };
    },
    { textSel: target.textSelector, cursorHostSel: target.cursorHost, containerSel: target.container },
  );

  await ctx.close();
  return measured;
}

(async () => {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const targets = [];
  if (args.target) {
    if (!KNOWN_TARGETS[args.target]) {
      console.error(`unknown --target=${args.target}; expected "new" or "old"`);
      process.exit(1);
    }
    targets.push(KNOWN_TARGETS[args.target]);
  } else {
    if (await isReachable(NEW_URL)) targets.push(KNOWN_TARGETS.new);
    else console.warn(`warning: ${NEW_URL} unreachable — skipping "new"`);
    if (await isReachable(OLD_URL)) targets.push(KNOWN_TARGETS.old);
    else console.warn(`note: ${OLD_URL} unreachable — skipping "old" (start an archive worktree server if needed)`);
  }
  if (targets.length === 0) {
    console.error("no reachable targets; start `python3 -m http.server 8000` first");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const report = { theme: THEME, viewport: { w: vpW, h: vpH }, targets: {} };
  for (const target of targets) {
    console.log(`[${target.label}] ${target.url}`);
    const frames = await captureFrames(browser, target);
    const styles = await measureStyles(browser, target);
    report.targets[target.label] = { url: target.url, frames, styles };
  }

  const reportPath = path.join(OUT_DIR, `report-${THEME}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`\nwrote ${reportPath}`);
  console.log(`screenshots: ${OUT_DIR}/hero-{label}-t{ms}.png`);
})();
