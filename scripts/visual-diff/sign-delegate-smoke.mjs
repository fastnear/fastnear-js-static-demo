// Ad-hoc smoke for the new Sign DelegateAction wiring. Asserts:
// - the tertiary button + result panel render in the DOM
// - app.signDelegateExample exists on globalThis.app
// - nearWallet.signDelegateActions exists on the loaded IIFE global
// - the local manifest claims signDelegateActions for Intear (and not Meteor)
// - the synced recipe is listed in the rendered recipes panel
// - forcing the button visible and clicking it produces the expected
//   "no wallet connected" branch (proves the handler is wired up without
//   needing a real wallet)
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/sign-delegate-smoke";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
const consoleLog = [];
page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));

await page.goto("http://localhost:8000/index.html", { waitUntil: "domcontentloaded" });
try { await page.waitForLoadState("networkidle", { timeout: 12000 }); } catch {}
await page.waitForTimeout(400);

// 1. DOM presence
const dom = await page.evaluate(() => {
  const btn = document.querySelector('[data-demo-tertiary-action]');
  const panel = document.getElementById('demo-delegate-result');
  const hash = document.getElementById('demo-delegate-hash');
  const copy = document.querySelector('[data-demo-delegate-copy]');
  return {
    btnPresent: !!btn,
    btnId: btn?.id,
    btnHidden: !!btn?.hidden,
    btnLabel: btn?.firstChild?.textContent?.trim(),
    btnHintText: btn?.querySelector('.btn-hint')?.textContent,
    panelPresent: !!panel,
    panelHidden: !!panel?.hidden,
    hashPresent: !!hash,
    copyPresent: !!copy,
    copyText: copy?.textContent,
  };
});

// 2. App helper + wallet API surface
const surfaces = await page.evaluate(() => ({
  hasAppSignDelegateExample: typeof globalThis.app?.signDelegateExample === "function",
  hasNearWalletSignDelegateActions: typeof globalThis.nearWallet?.signDelegateActions === "function",
  hasNearWalletWalletName: typeof globalThis.nearWallet?.walletName === "function",
}));

// 3. Local manifest claims
const manifest = await page.evaluate(() =>
  fetch("/manifest.json").then((r) => r.json()).then((m) => {
    const intear = m.wallets.find((w) => w.id === "intear-wallet");
    const meteor = m.wallets.find((w) => w.id === "meteor-wallet");
    return {
      intearDelegate: !!intear?.features?.signDelegateActions,
      meteorDelegate: !!meteor?.features?.signDelegateActions,
    };
  })
);

// 4. Recipes catalog has the new recipe rendered into the panel
await page.locator('#agent-recipes').scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(200);
const recipePanel = await page.evaluate(() => {
  const text = document.getElementById('agent-recipes')?.textContent || '';
  return {
    mentionsSignDelegate: text.toLowerCase().includes('sign delegate') || text.includes('signDelegateActions'),
    cardCount: document.querySelectorAll('#agent-recipes article, #agent-recipes .recipe-card').length,
  };
});

// 5. Force the tertiary button visible and click — confirms handler is wired,
//    catches the "Not signed in" branch (no real wallet attached).
await page.evaluate(() => {
  document.body.classList.add("is-signed-in");
  document.querySelector('[data-demo-card="actions"]').setAttribute("data-demo-mode", "interactive");
  const btn = document.querySelector('[data-demo-tertiary-action]');
  btn.hidden = false;
  btn.disabled = false;
});
await page.waitForTimeout(150);
await page.locator('[data-demo-tertiary-action]').click();
await page.waitForTimeout(250);
const clickEffect = await page.evaluate(() => ({
  panelHiddenAfterClick: !!document.getElementById('demo-delegate-result')?.hidden,
  consoleHasNotSignedIn: false, // populated from outer log below
}));

// 6. Screenshot the action card with the new button visible
await page.locator('[data-demo-card="actions"]').screenshot({ path: path.join(OUT, "actions-card.png") });

// 7. Force the result panel visible with a synthetic hash, screenshot
await page.evaluate(() => {
  const hashEl = document.getElementById('demo-delegate-hash');
  const panel = document.getElementById('demo-delegate-result');
  hashEl.dataset.fullHex = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  hashEl.textContent = "abcdef01…0123456789".slice(0, 8) + "…" + "abcdef0123456789abcdef0123456789".slice(-8);
  panel.hidden = false;
});
await page.waitForTimeout(150);
await page.locator('[data-demo-card="actions"]').screenshot({ path: path.join(OUT, "actions-card-with-result.png") });

await browser.close();

const consoleHasNotSignedInLine = consoleLog.some((l) => /Not signed in/i.test(l));

const fails = [];
function expect(cond, msg) { if (!cond) fails.push(msg); }
expect(dom.btnPresent, "tertiary button missing from DOM");
expect(dom.btnId === "sign-delegate", `wrong button id: ${dom.btnId}`);
expect(dom.btnHidden, "tertiary button should start hidden (no wallet connected)");
expect(/Sign DelegateAction/.test(dom.btnLabel || ""), `wrong button label: ${dom.btnLabel}`);
expect(/relayer-submittable/.test(dom.btnHintText || ""), `wrong btn-hint: ${dom.btnHintText}`);
expect(dom.panelPresent, "result panel missing");
expect(dom.panelHidden, "result panel should start hidden");
expect(dom.hashPresent, "hash code element missing");
expect(dom.copyPresent, "copy button missing");
expect(/Copy hash/i.test(dom.copyText || ""), `wrong copy button text: ${dom.copyText}`);
expect(surfaces.hasAppSignDelegateExample, "app.signDelegateExample missing");
// nearWallet.signDelegateActions is loaded from unpkg @latest. If the
// runtime export hasn't propagated yet, the demo should degrade
// gracefully — walletSupportsDelegate() short-circuits on the missing
// function so the button stays hidden. Surface the state as a note
// rather than a failure.
if (!surfaces.hasNearWalletSignDelegateActions) {
  console.log("\nNOTE: nearWallet.signDelegateActions is NOT in the loaded IIFE yet — walletSupportsDelegate() must keep the button hidden until @fastnear/wallet publishes a version that exports it.");
}
expect(surfaces.hasNearWalletWalletName, "nearWallet.walletName missing — wallet IIFE may need refresh");
expect(manifest.intearDelegate, "Intear should claim signDelegateActions in local manifest");
expect(!manifest.meteorDelegate, "Meteor should NOT claim signDelegateActions in local manifest");
expect(recipePanel.cardCount > 0, "agent-recipes panel rendered no cards");
expect(recipePanel.mentionsSignDelegate, "agent-recipes panel does not mention sign delegate / signDelegateActions");
expect(consoleHasNotSignedInLine, "click handler did not reach the 'Not signed in' branch (handler may not be wired)");
expect(clickEffect.panelHiddenAfterClick, "result panel should still be hidden after a click that produces no signature");

console.log("DOM:", JSON.stringify(dom, null, 2));
console.log("Surfaces:", JSON.stringify(surfaces, null, 2));
console.log("Manifest:", JSON.stringify(manifest, null, 2));
console.log("Recipes:", JSON.stringify(recipePanel, null, 2));
console.log("Console-warned-not-signed-in:", consoleHasNotSignedInLine);

if (fails.length) {
  console.error("\nFAIL:");
  fails.forEach((f) => console.error("  -", f));
  process.exit(1);
}
console.log("\nOK — screenshot at", path.join(OUT, "actions-card.png"));
