// Verifies the wallet library now keeps per-network sessions natively, so
// flipping mainnet ↔ testnet doesn't disturb the other network's storage.
//
// We forge wallet localStorage keys in the library's new shape
// (`<walletId>:<network>:<key>` plus `selected-wallet:<network>`), flip via
// `app.setNetwork('…')`, and assert each flip leaves both networks' keys
// intact. No real wallet executor is exercised — this test is about the
// library's storage discipline, not full sign-in flow.

import { chromium } from "playwright";

const URL = "http://localhost:8000/index.html";

const FAKE_MAINNET = {
  "mynearwallet:mainnet:signedAccountId": "mike.near",
  "mynearwallet:mainnet:functionCallKey": JSON.stringify({ privateKey: "ed25519:fakeM", contractId: "berryclub.ek.near", methods: [] }),
  "selected-wallet:mainnet": "mynearwallet",
};
const FAKE_TESTNET = {
  "mynearwallet:testnet:signedAccountId": "mike.testnet",
  "mynearwallet:testnet:functionCallKey": JSON.stringify({ privateKey: "ed25519:fakeT", contractId: "count.mike.testnet", methods: [] }),
  "selected-wallet:testnet": "mynearwallet",
};
const ALL_KEYS = [...Object.keys(FAKE_MAINNET), ...Object.keys(FAKE_TESTNET)];

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

async function readState(page) {
  return page.evaluate((keys) => {
    const flat = {};
    for (const k of keys) flat[k] = localStorage.getItem(k);
    return { flat, currentNetwork: window.app?.network };
  }, ALL_KEYS);
}

async function waitForReload(page, action) {
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await action();
  await navigation;
  try { await page.waitForLoadState("networkidle", { timeout: 10000 }); } catch {}
  await page.waitForFunction(() => !!window.app);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`); });

  const failures = [];

  // Clean slate: clear localStorage and start fresh on mainnet.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.app);
  await page.evaluate(() => localStorage.clear());
  await waitForReload(page, () => page.reload());

  // Forge sessions for BOTH networks.
  await page.evaluate((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, { ...FAKE_MAINNET, ...FAKE_TESTNET });

  let s = await readState(page);
  for (const k of Object.keys(FAKE_MAINNET)) {
    assert(s.flat[k] === FAKE_MAINNET[k], `setup: ${k} should be set`, failures);
  }
  assert(s.currentNetwork === "mainnet", "setup: app.network should be mainnet", failures);

  // Flip to testnet — neither network's keys should change.
  await waitForReload(page, () => page.evaluate(() => window.app.setNetwork("testnet")));
  s = await readState(page);
  assert(s.currentNetwork === "testnet", "after flip: app.network should be testnet", failures);
  for (const [k, v] of Object.entries(FAKE_MAINNET)) {
    assert(s.flat[k] === v, `after flip mainnet→testnet: mainnet key ${k} should be preserved`, failures);
  }
  for (const [k, v] of Object.entries(FAKE_TESTNET)) {
    assert(s.flat[k] === v, `after flip mainnet→testnet: testnet key ${k} should be preserved`, failures);
  }

  // Flip back to mainnet — same expectation: neither network is disturbed.
  await waitForReload(page, () => page.evaluate(() => window.app.setNetwork("mainnet")));
  s = await readState(page);
  assert(s.currentNetwork === "mainnet", "after flip back: app.network should be mainnet", failures);
  for (const [k, v] of Object.entries(FAKE_MAINNET)) {
    assert(s.flat[k] === v, `after flip back: mainnet key ${k} should be preserved`, failures);
  }
  for (const [k, v] of Object.entries(FAKE_TESTNET)) {
    assert(s.flat[k] === v, `after flip back: testnet key ${k} should be preserved`, failures);
  }

  await browser.close();

  console.log("State at end:", JSON.stringify(s, null, 2));
  if (pageErrors.length) {
    console.log("\nCONSOLE ERRORS:");
    pageErrors.forEach((e) => console.log("  -", e));
  }
  if (failures.length) {
    console.log("\nFAIL:");
    failures.forEach((f) => console.log("  -", f));
    process.exit(1);
  }
  if (pageErrors.length) process.exit(1);
  console.log("\nOK");
})();
