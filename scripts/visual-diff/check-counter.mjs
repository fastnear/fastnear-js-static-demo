// Ad-hoc screenshot of testnet counter in interactive mode after the
// [hidden]-override + single-column metric-grid + desktop width cap.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");

async function capture(browser, theme, viewport, label) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((m) => { try { localStorage.setItem("theme", m); } catch {} }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto("http://localhost:8000/index.html?network=testnet", { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.body.classList.add("is-signed-in");
    document.querySelector('[data-demo-card="actions"]').setAttribute("data-demo-mode", "interactive");
  });
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const grid = document.querySelector('.demo-grid');
    const card = document.querySelector('[data-demo-card="actions"]');
    return {
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : "no-el",
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : -1,
    };
  });
  console.log(`[${theme} ${viewport.width}x${viewport.height}] ${label}`, JSON.stringify(info));

  const section = page.locator('#example-app');
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await section.screenshot({ path: path.join(OUT, `counter-${theme}-${label}.png`) });
  if (errors.length) console.log(`  errors:`, errors);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  // Desktop wide (> 1100px breakpoint): should hit the 36rem cap + center.
  await capture(browser, "dark", { width: 1280, height: 900 }, "1280");
  await capture(browser, "light", { width: 1280, height: 900 }, "1280");
  // Narrow desktop (just below 1100px): should be single-col full-width.
  await capture(browser, "dark", { width: 1000, height: 900 }, "1000");
  // Mobile: single-col full-width.
  await capture(browser, "dark", { width: 420, height: 800 }, "420");
  await browser.close();
})();
