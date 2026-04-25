// Visual smoke of the three Browser Example modes. Flips
// `[data-demo-card="actions"][data-demo-mode]` + `body.is-signed-in` directly
// (the same state updateUI would produce) and captures each mode. Behavioral
// correctness of updateUI() is verified by code review; this script is
// strictly a layout/CSS check.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
const URL = "http://localhost:8000/index.html";

async function runMode(browser, theme, label, setup) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem("theme", m); } catch {}
  }, theme);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`); });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(400);

  await page.evaluate(setup);
  await page.waitForTimeout(150);

  const info = await page.evaluate(() => {
    const card = document.querySelector('[data-demo-card="actions"]');
    const preview = document.querySelector('[data-demo-card="preview"]');
    const section = document.querySelector('#example-app');
    const hero = document.querySelector('.hero-shell');
    return {
      demoMode: card?.getAttribute("data-demo-mode"),
      isSignedInBodyClass: document.body.classList.contains("is-signed-in"),
      previewHidden: !!preview?.hidden,
      heroTop: Math.round(hero?.getBoundingClientRect().top ?? -1),
      exampleTop: Math.round(section?.getBoundingClientRect().top ?? -1),
      exampleOrder: getComputedStyle(section).order,
      heroOrder: getComputedStyle(hero).order,
      signinVisible: card?.querySelector('.demo-mode-signin')?.offsetParent !== null,
      interactiveVisible: card?.querySelector('.demo-mode-interactive')?.offsetParent !== null,
      customVisible: card?.querySelector('.demo-mode-custom')?.offsetParent !== null,
      customAccount: document.getElementById('demo-custom-account')?.textContent,
      customContract: document.getElementById('demo-custom-contract')?.textContent,
    };
  });

  await page.screenshot({ path: path.join(OUT_DIR, `demo-${theme}-${label}-full.png`), fullPage: true });
  const section = page.locator('#example-app');
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await section.screenshot({ path: path.join(OUT_DIR, `demo-${theme}-${label}.png`) });

  await ctx.close();
  return { info, consoleErrors };
}

(async () => {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];

  // 1. Signed out — initial state. No setup needed.
  const signedOut = await runMode(browser, "dark", "signedout", () => {});
  console.log("\n[signedout]", JSON.stringify(signedOut.info, null, 2));
  if (signedOut.info.demoMode !== "signin") failures.push("signedout: demoMode should be signin");
  if (signedOut.info.isSignedInBodyClass) failures.push("signedout: body should NOT have is-signed-in");
  if (!signedOut.info.signinVisible) failures.push("signedout: signin block should be visible");
  if (signedOut.info.interactiveVisible) failures.push("signedout: interactive block should be hidden");
  if (signedOut.info.customVisible) failures.push("signedout: custom block should be hidden");
  if (signedOut.info.exampleOrder !== "10") failures.push(`signedout: example order should be 10, got ${signedOut.info.exampleOrder}`);

  // 2. Interactive — simulate signed in at default contract.
  const interactive = await runMode(browser, "dark", "interactive", () => {
    document.body.classList.add("is-signed-in");
    document.querySelector('[data-demo-card="actions"]').setAttribute("data-demo-mode", "interactive");
  });
  console.log("\n[interactive]", JSON.stringify(interactive.info, null, 2));
  if (interactive.info.demoMode !== "interactive") failures.push("interactive: demoMode wrong");
  if (!interactive.info.isSignedInBodyClass) failures.push("interactive: body should have is-signed-in");
  if (!interactive.info.interactiveVisible) failures.push("interactive: interactive block should be visible");
  if (interactive.info.signinVisible) failures.push("interactive: signin block should be hidden");
  if (interactive.info.customVisible) failures.push("interactive: custom block should be hidden");
  if (interactive.info.exampleOrder !== "1") failures.push(`interactive: example order should be 1, got ${interactive.info.exampleOrder}`);

  // 3. Custom — signed in on a custom contract.
  const custom = await runMode(browser, "dark", "custom", () => {
    document.body.classList.add("is-signed-in");
    const card = document.querySelector('[data-demo-card="actions"]');
    card.setAttribute("data-demo-mode", "custom");
    document.getElementById("demo-custom-account").textContent = "mike.near";
    document.getElementById("demo-custom-contract").textContent = "my.custom.contract.near";
    // Also hide the preview card to mimic the JS doing so on atDefault=false.
    const preview = document.querySelector('[data-demo-card="preview"]');
    if (preview) preview.hidden = true;
  });
  console.log("\n[custom]", JSON.stringify(custom.info, null, 2));
  if (custom.info.demoMode !== "custom") failures.push("custom: demoMode wrong");
  if (!custom.info.customVisible) failures.push("custom: custom block should be visible");
  if (custom.info.signinVisible) failures.push("custom: signin block should be hidden");
  if (custom.info.interactiveVisible) failures.push("custom: interactive block should be hidden");
  if (!custom.info.previewHidden) failures.push("custom: preview should be hidden");
  if (custom.info.customAccount !== "mike.near") failures.push("custom: account text wrong");
  if (custom.info.customContract !== "my.custom.contract.near") failures.push("custom: contract text wrong");

  await browser.close();

  const allErrors = [
    ...signedOut.consoleErrors.map((e) => `signedout: ${e}`),
    ...interactive.consoleErrors.map((e) => `interactive: ${e}`),
    ...custom.consoleErrors.map((e) => `custom: ${e}`),
  ];
  if (allErrors.length) {
    console.log("\nCONSOLE ERRORS:");
    allErrors.forEach((e) => console.log("  -", e));
  }

  if (failures.length || allErrors.length) {
    console.log("\nFAIL:");
    failures.forEach((f) => console.log("  -", f));
    process.exit(1);
  }
  console.log("\nOK");
})();
