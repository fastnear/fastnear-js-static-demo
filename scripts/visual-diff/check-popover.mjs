// Smoke check for the navbar Option A popover: screenshots the header cluster
// closed vs open + verifies the gear actually opens the popover and shows the
// network + contract slots. Not a regression harness — just enough to eyeball
// the new layout works.
//
// Usage:
//   npm run serve &     # or have the server up on :8000
//   node scripts/visual-diff/check-popover.mjs [--theme=dark|light]
//                                              [--viewport=1280x900]

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
const [vpW, vpH] = (args.viewport || "1280x900").split("x").map(Number);

(async () => {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: vpW, height: vpH } });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem("theme", m); } catch {}
  }, THEME);

  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(400);

  // 1. Closed header cluster.
  await page.screenshot({
    path: path.join(OUT_DIR, `popover-${THEME}-closed.png`),
    clip: { x: vpW - 520, y: 0, width: 520, height: 140 },
  });

  // 1b. Hero top (for Option A install-sidebar sanity check).
  const heroTopEl = await page.locator('.hero-top').first().boundingBox();
  if (heroTopEl) {
    await page.screenshot({
      path: path.join(OUT_DIR, `hero-install-${THEME}.png`),
      clip: {
        x: Math.max(0, heroTopEl.x - 8),
        y: Math.max(0, heroTopEl.y - 8),
        width: Math.min(vpW - Math.max(0, heroTopEl.x - 8), heroTopEl.width + 16),
        height: Math.min(vpH - heroTopEl.y + 8, heroTopEl.height + 16),
      },
    });
  }

  // 2. Click the gear.
  const gear = page.locator('[data-config-toggle]').first();
  await gear.click();
  await page.waitForTimeout(200);

  // 3. Opened header + dropdown. Clip from x=0 so narrow-viewport runs aren't
  // clipped off-screen on the left.
  const clipX = vpW < 600 ? 0 : vpW - 520;
  const clipW = vpW < 600 ? vpW : 520;
  await page.screenshot({
    path: path.join(OUT_DIR, `popover-${THEME}-open.png`),
    clip: { x: clipX, y: 0, width: clipW, height: 380 },
  });

  const ariaExpanded = await gear.getAttribute("aria-expanded");
  const dropdownVisible = await page.locator('.config-menu.open .config-dropdown').isVisible().catch(() => false);
  const hasNetworkSlot = await page.locator('.config-dropdown [data-network-slot]').count();
  const hasContractSlot = await page.locator('.config-dropdown [data-contract-slot]').count();
  const signInVisible = await page.locator('[data-auth-signin]').first().isVisible().catch(() => false);

  // 4. Click outside to close.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(200);
  const closedAgain = !(await page.locator('.config-menu.open').count());
  const ariaAfterClose = await gear.getAttribute("aria-expanded");

  // 5. Open, then ESC to close.
  await gear.click();
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const closedByEsc = !(await page.locator('.config-menu.open').count());

  // 6. Scroll to reveal sticky header, open its own gear, confirm its dropdown.
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await page.waitForTimeout(250);
  const stickyGear = page.locator('.sticky-controls [data-config-toggle]');
  await stickyGear.click();
  await page.waitForTimeout(200);
  const stickyDropdownVisible = await page.locator('.sticky-controls .config-menu.open .config-dropdown').isVisible().catch(() => false);
  await page.screenshot({
    path: path.join(OUT_DIR, `popover-${THEME}-sticky.png`),
    clip: { x: (vpW < 600 ? 0 : vpW - 520), y: 0, width: (vpW < 600 ? vpW : 520), height: 380 },
  });

  await browser.close();

  console.log(JSON.stringify({
    ariaExpandedWhenOpen: ariaExpanded,
    dropdownVisible,
    hasNetworkSlot,
    hasContractSlot,
    signInVisible,
    closedByOutsideClick: closedAgain,
    ariaAfterClose,
    closedByEsc,
    stickyDropdownVisible,
    consoleErrors,
  }, null, 2));

  if (
    ariaExpanded !== "true" ||
    !dropdownVisible ||
    hasNetworkSlot < 1 ||
    hasContractSlot < 1 ||
    !signInVisible ||
    !closedAgain ||
    ariaAfterClose !== "false" ||
    !closedByEsc ||
    !stickyDropdownVisible ||
    consoleErrors.length > 0
  ) {
    console.error("FAIL — see above");
    process.exit(1);
  }
  console.log("OK");
})();
