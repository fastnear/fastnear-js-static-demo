// Verifies the library migrates pre-network-namespaced keys (the old
// shape `<walletId>:<key>` and bare `selected-wallet`) into the new
// `<walletId>:mainnet:<key>` and `selected-wallet:mainnet` slots on first
// load. This protects existing users from getting silently logged out
// after the library upgrade.

import { chromium } from "playwright";

const URL = "http://localhost:8000/index.html";

const LEGACY = {
  "selected-wallet": "mynearwallet",
  "mynearwallet:signedAccountId": "mike.near",
  "mynearwallet:functionCallKey": JSON.stringify({ privateKey: "ed25519:fakeM", contractId: "berryclub.ek.near", methods: [] }),
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`); });

  const failures = [];

  // Clean slate.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.app);
  await page.evaluate(() => localStorage.clear());

  // Forge legacy-shape keys.
  await page.evaluate((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, LEGACY);

  // Reload to let the library boot from the legacy state and migrate.
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await page.reload();
  await navigation;
  try { await page.waitForLoadState("networkidle", { timeout: 10000 }); } catch {}
  await page.waitForFunction(() => !!window.app);
  // Library migration is fire-and-forget. Allow a beat for it to settle.
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      out[k] = localStorage.getItem(k);
    }
    return out;
  });
  console.log("After migration:", JSON.stringify(after, null, 2));

  // Legacy keys should be gone.
  if (after["selected-wallet"] !== undefined) failures.push(`legacy "selected-wallet" should be removed (got ${after["selected-wallet"]})`);
  if (after["mynearwallet:signedAccountId"] !== undefined) failures.push(`legacy "mynearwallet:signedAccountId" should be removed`);
  if (after["mynearwallet:functionCallKey"] !== undefined) failures.push(`legacy "mynearwallet:functionCallKey" should be removed`);

  // New shape should hold the migrated values.
  if (after["selected-wallet:mainnet"] !== "mynearwallet") failures.push(`migrated "selected-wallet:mainnet" should be "mynearwallet" (got ${after["selected-wallet:mainnet"]})`);
  if (after["mynearwallet:mainnet:signedAccountId"] !== "mike.near") failures.push(`migrated "mynearwallet:mainnet:signedAccountId" should be "mike.near" (got ${after["mynearwallet:mainnet:signedAccountId"]})`);
  if (!after["mynearwallet:mainnet:functionCallKey"]?.includes("berryclub.ek.near")) failures.push(`migrated functionCallKey should be present`);

  await browser.close();

  if (failures.length) {
    console.log("\nFAIL:");
    failures.forEach((f) => console.log("  -", f));
    process.exit(1);
  }
  if (pageErrors.length) {
    console.log("\nCONSOLE ERRORS:");
    pageErrors.forEach((e) => console.log("  -", e));
    process.exit(1);
  }
  console.log("\nOK");
})();
