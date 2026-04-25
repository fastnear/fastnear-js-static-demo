// Verifies (a) signed-out card copy switches per network and
// (b) MyNearWallet appears in the wallet picker on both networks.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");

async function probe(browser, networkParam) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  const url = "http://localhost:8000/index.html" + (networkParam ? `?network=${networkParam}` : "");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForFunction(() => !!window.app);
  await page.waitForTimeout(300);

  const copy = await page.evaluate(() => ({
    network: window.app?.network,
    signinTitle: document.querySelector("[data-demo-signin-title]")?.textContent?.trim(),
    signinNote: document.querySelector("[data-demo-signin-note]")?.textContent?.replace(/\s+/g, " ").trim(),
    sectionTitle: document.querySelector("[data-demo-section-title]")?.textContent?.trim(),
    sectionSummary: document.querySelector("[data-demo-section-summary]")?.textContent?.replace(/\s+/g, " ").trim(),
  }));

  // Click the in-card Sign In button → opens the wallet picker. near-connect
  // renders each wallet as `.connect-item[data-type="<walletId>"]`.
  let wallets = [];
  try {
    await page.locator('.demo-mode-signin [data-auth-signin]').click();
    await page.waitForSelector(".connect-item[data-type]", { timeout: 8000 });
    wallets = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".connect-item[data-type]"));
      return items.map((el) => el.getAttribute("data-type")).filter(Boolean);
    });
  } catch (e) {
    errors.push(`picker probe: ${e.message}`);
  }

  await page.screenshot({ path: path.join(OUT, `signin-${networkParam || "mainnet"}.png`), fullPage: false });
  await ctx.close();

  return { copy, wallets, errors };
}

(async () => {
  const browser = await chromium.launch();
  const failures = [];

  const m = await probe(browser, null);
  console.log("[mainnet]", JSON.stringify({ copy: m.copy, walletsLen: m.wallets.length }, null, 2));
  if (!/draw or buy/i.test(m.copy.signinTitle || "")) failures.push(`mainnet title wrong: ${m.copy.signinTitle}`);
  if (!/draw|buy_tokens|berryclub/i.test(m.copy.signinNote || "")) failures.push(`mainnet note wrong: ${m.copy.signinNote}`);
  if (!/berry|berry\.fast|Berry Club/i.test(m.copy.sectionTitle || "")) failures.push(`mainnet section title wrong: ${m.copy.sectionTitle}`);
  if (!/berry|berryclub|FastNear/i.test(m.copy.sectionSummary || "")) failures.push(`mainnet section summary wrong: ${m.copy.sectionSummary}`);
  const mnwOnMainnet = m.wallets.some((w) => /MyNearWallet|mynearwallet/i.test(w));
  if (!mnwOnMainnet) failures.push(`mainnet picker missing MyNearWallet (found: ${m.wallets.slice(0, 10).join(", ")})`);

  const t = await probe(browser, "testnet");
  console.log("[testnet]", JSON.stringify({ copy: t.copy, walletsLen: t.wallets.length }, null, 2));
  if (!/increase the counter/i.test(t.copy.signinTitle || "")) failures.push(`testnet title wrong: ${t.copy.signinTitle}`);
  if (!/increase|count\.mike\.testnet/i.test(t.copy.signinNote || "")) failures.push(`testnet note wrong: ${t.copy.signinNote}`);
  if (!/testnet|counter/i.test(t.copy.sectionTitle || "")) failures.push(`testnet section title wrong: ${t.copy.sectionTitle}`);
  if (!/count\.mike\.testnet|testnet|counter/i.test(t.copy.sectionSummary || "")) failures.push(`testnet section summary wrong: ${t.copy.sectionSummary}`);
  if (/Berry Club|berry\.fast/i.test(t.copy.sectionTitle || "")) failures.push(`testnet section title still says berry: ${t.copy.sectionTitle}`);
  const mnwOnTestnet = t.wallets.some((w) => /MyNearWallet|mynearwallet/i.test(w));
  if (!mnwOnTestnet) failures.push(`testnet picker missing MyNearWallet (found: ${t.wallets.slice(0, 10).join(", ")})`);

  await browser.close();

  if (failures.length || m.errors.length || t.errors.length) {
    console.log("\nFAIL:");
    failures.forEach((f) => console.log("  -", f));
    [...m.errors, ...t.errors].forEach((e) => console.log("  err:", e));
    process.exit(1);
  }
  console.log("\nOK");
})();
