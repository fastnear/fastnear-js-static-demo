// responsive.mjs — screenshot the hero banner at real-device viewport widths.
//
// Use this to check that the big "FastNear ▮ → [JS]" treatment stays readable
// and proportional across mobile/tablet/desktop widths, and that nothing below
// the hero breaks on narrow viewports.
//
// Usage:
//   node scripts/visual-diff/responsive.mjs [--theme=dark|light]
//                                           [--url=<url>]
//                                           [--widths=320,375,414,768,1024,1280,1920]
//
// Output:
//   scripts/visual-diff/out/responsive-{theme}-w{width}-hero.png  (banner crop)
//   scripts/visual-diff/out/responsive-{theme}-w{width}-page.png  (top-of-page,
//                                                                  height clipped
//                                                                  to viewport)

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
const WIDTHS = (args.widths || "320,375,414,768,1024,1280,1920")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

// Device-honest viewport heights — pairs that feel like real devices. Fall back
// to 900 for unknown widths. These only affect the "page" screenshot clip.
const HEIGHT_BY_WIDTH = {
  320: 568,   // iPhone SE 1st gen
  375: 667,   // iPhone 8
  414: 896,   // iPhone 11 Pro Max
  768: 1024,  // iPad portrait
  1024: 768,  // iPad landscape / small laptop
  1280: 800,
  1366: 768,
  1440: 900,
  1920: 1080,
};

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
  const report = { theme: THEME, url: URL, widths: [] };

  for (const w of WIDTHS) {
    const h = HEIGHT_BY_WIDTH[w] || 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await setTheme(ctx, THEME);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {}
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(2500); // let blink animation finish

    const heroLocator = page.locator(".hero-prompt-banner").first();
    const hasHero = (await heroLocator.count()) > 0;
    const heroPath = path.join(OUT_DIR, `responsive-${THEME}-w${w}-hero.png`);
    if (hasHero) {
      await heroLocator.screenshot({ path: heroPath });
    }

    const pagePath = path.join(OUT_DIR, `responsive-${THEME}-w${w}-page.png`);
    await page.screenshot({ path: pagePath, clip: { x: 0, y: 0, width: w, height: h } });

    // Measure a few hero dimensions to spot overflow / sub-optimal scaling
    const measured = await page.evaluate(() => {
      const banner = document.querySelector(".hero-prompt-banner");
      const prompt = document.querySelector(".hero-prompt");
      const body = document.body;
      const bcs = banner && getComputedStyle(banner);
      const pcs = prompt && getComputedStyle(prompt);
      const pr = prompt && prompt.getBoundingClientRect();
      return {
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        bannerWidth: banner ? banner.getBoundingClientRect().width : null,
        bannerPadding: bcs ? bcs.padding : null,
        promptFontSize: pcs ? pcs.fontSize : null,
        promptWidth: pr ? pr.width : null,
        horizontalOverflow: body.scrollWidth > body.clientWidth,
      };
    });

    console.log(
      `w=${w}h=${h}: fontSize=${measured.promptFontSize} promptWidth=${measured.promptWidth?.toFixed(
        1,
      )} overflow=${measured.horizontalOverflow}`,
    );
    report.widths.push({ w, h, heroPath: hasHero ? heroPath : null, pagePath, measured });
    await ctx.close();
  }
  await browser.close();

  const reportPath = path.join(OUT_DIR, `responsive-${THEME}.json`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${reportPath}`);
})();
