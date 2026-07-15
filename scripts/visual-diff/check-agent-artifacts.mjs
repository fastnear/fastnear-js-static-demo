// Validates the agent-first surface served from public/:
// - public/recipes.json parses, has the expected recipe IDs, and exposes the
//   schema-v5 @fastnear/x402 discovery contract
// - public/agents.js is syntactically valid JS
// - public/llms.txt has the canonical anchor sections agents look for
// - the synced public/* files match the sibling fastnear-js-monorepo
//   source (skipped with a warning when the monorepo isn't checked out)
// - any recipes/<id> referenced in public/index.html or public/index.js
//   exists in the catalog
//
// Pure Node, no Playwright — this isn't a visual smoke. Run as:
//   node scripts/visual-diff/check-agent-artifacts.mjs
//
// Prints findings + "OK" on success; exits non-zero on failure.

import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const publicDir = path.join(repoRoot, "public");
const monorepoRoot = path.resolve(repoRoot, "..", "fastnear-js-monorepo");

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

const EXPECTED_RECIPE_IDS = [
  "view-contract",
  "view-account",
  "inspect-transaction",
  "account-full",
  "transfers-query",
  "last-block-final",
  "kv-latest-key",
  "connect-wallet",
  "function-call",
  "transfer",
  "sign-message",
  "sign-delegate-actions",
  "ft-balance",
  "ft-metadata",
  "ft-inventory",
  "nft-for-owner",
  "nft-inventory",
  "archival-snapshot",
  "connect-testnet",
  "function-call-testnet",
];

const EXPECTED_X402_ENTRYPOINTS = new Map([
  ["@fastnear/x402", [
    "createFastNearWalletSigner",
    "createNearX402Client",
    "createNearPaymentFetch",
  ]],
  ["@fastnear/x402/node", ["createLocalNearSigner"]],
  ["@fastnear/x402/server", ["createNearResourceServer"]],
  ["@fastnear/x402/facilitator", ["createNearFacilitator"]],
]);

const EXPECTED_X402_TASKS = new Map([
  ["Pay an x402 URL from Node.js", {
    use: ["createLocalNearSigner", "createNearPaymentFetch"],
    imports: ["@fastnear/x402/node", "@fastnear/x402"],
  }],
  ["Pay an x402 URL from a browser wallet", {
    use: ["createFastNearWalletSigner", "createNearPaymentFetch"],
    imports: ["@fastnear/wallet", "@fastnear/x402"],
  }],
  ["Protect a seller resource", {
    use: ["createNearResourceServer"],
    imports: ["@fastnear/x402/server"],
  }],
  ["Operate a NEAR facilitator", {
    use: ["createNearFacilitator"],
    imports: ["@fastnear/x402/facilitator"],
  }],
  ["Integrate below the paid-fetch helper", {
    use: ["createNearX402Client"],
    imports: ["@fastnear/x402"],
  }],
]);

function hasExactStrings(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function validateX402Discovery(value) {
  if (value.version !== 5) {
    fail(`recipes.json must use schema v5 for x402 discovery (found ${JSON.stringify(value.version)}; sync the stable schema-v5 artifacts before launch)`);
  }
  if (!Array.isArray(value.packages) || !value.packages.includes("@fastnear/x402")) {
    fail(`recipes.json packages must identify @fastnear/x402`);
  }

  const surface = value.x402;
  if (!surface || typeof surface !== "object" || Array.isArray(surface)) {
    fail(`recipes.json missing top-level x402 discovery metadata`);
    return;
  }
  if (surface.package !== "@fastnear/x402") {
    fail(`recipes.json x402.package must be @fastnear/x402`);
  }

  if (!Array.isArray(surface.entrypoints) || surface.entrypoints.length !== 4) {
    fail(`recipes.json x402 must expose exactly four focused entrypoints`);
  } else {
    const factories = [];
    for (const [subpath, expectedExports] of EXPECTED_X402_ENTRYPOINTS) {
      const entrypoint = surface.entrypoints.find((item) => item?.subpath === subpath);
      if (!entrypoint || !hasExactStrings(entrypoint.exports, expectedExports)) {
        fail(`recipes.json x402 entrypoint ${subpath} has unexpected exports`);
      } else {
        factories.push(...entrypoint.exports);
      }
    }
    if (factories.length !== 6 || new Set(factories).size !== 6) {
      fail(`recipes.json x402 entrypoints must expose exactly six unique factories`);
    }
  }

  if (!Array.isArray(surface.chooseByTask)) {
    fail(`recipes.json x402 missing task-to-entrypoint mappings`);
  } else {
    for (const [task, expected] of EXPECTED_X402_TASKS) {
      const mapping = surface.chooseByTask.find((item) => item?.task === task);
      if (!mapping
        || !hasExactStrings(mapping.use, expected.use)
        || !hasExactStrings(mapping.imports, expected.imports)) {
        fail(`recipes.json x402 task mapping is incomplete for ${JSON.stringify(task)}`);
      }
    }
  }

  const quickstartIds = Array.isArray(surface.quickstarts)
    ? surface.quickstarts.map((item) => item?.id)
    : [];
  for (const id of ["x402-node-paid-fetch", "x402-remote-facilitator-seller"]) {
    if (!quickstartIds.includes(id)) {
      fail(`recipes.json x402 missing quickstart ${id}`);
    }
  }

  const protocol = surface.protocol;
  if (protocol?.version !== 2
    || protocol?.scheme !== "exact"
    || !hasExactStrings(protocol?.networks, ["near:mainnet", "near:testnet"])) {
    fail(`recipes.json x402 protocol must be v2 exact on NEAR mainnet/testnet only`);
  }
  const constraints = Array.isArray(surface.constraints) ? surface.constraints : [];
  for (const phrase of ["Only x402 v2 exact", "NEP-141", "explicit facilitator"]) {
    if (!constraints.some((constraint) => typeof constraint === "string" && constraint.includes(phrase))) {
      fail(`recipes.json x402 constraints missing ${JSON.stringify(phrase)}`);
    }
  }

  let guideUrl;
  try {
    guideUrl = new URL(surface.guideUrl);
  } catch {
    guideUrl = null;
  }
  if (!guideUrl
    || guideUrl.protocol !== "https:"
    || !guideUrl.hostname
    || !guideUrl.pathname.endsWith("/packages/x402/README.md")) {
    fail(`recipes.json x402 guideUrl must be an absolute HTTPS package-guide URL`);
  }
}

const LLMS_REQUIRED_SECTIONS = [
  "# FastNear JS monorepo",
  "Primary packages:",
  "Low-level-first runtime surfaces:",
  "Wallet runtime surfaces (@fastnear/wallet):",
  "Named endpoint response types:",
  "Canonical machine-readable catalog:",
  "Canonical hosted agent wrapper:",
  "Mental model:",
  "Result shapes:",
  "Discovery order:",
  "Families:",
  "Recipe index format:",
  "Recipe index:",
];

// Specific wallet exports that must show up in the wallet runtime surfaces
// section. addFunctionCallKey landed in @fastnear/wallet@1.1.4 and is the
// canonical post-sign-in second-FCK entrypoint — losing it from llms.txt
// hides a non-trivial agent capability.
const LLMS_REQUIRED_WALLET_EXPORTS = [
  "nearWallet.connect",
  "nearWallet.sendTransaction",
  "nearWallet.signMessage",
  "nearWallet.addFunctionCallKey",
];

// ---- recipes.json: parse + recipe-ID coverage ----
const recipesPath = path.join(publicDir, "recipes.json");
let catalog = null;
try {
  catalog = JSON.parse(readFileSync(recipesPath, "utf8"));
} catch (err) {
  fail(`public/recipes.json failed to parse: ${err.message}`);
}

let actualIds = [];
if (catalog) {
  if (!Array.isArray(catalog.recipes)) {
    fail(`public/recipes.json missing top-level "recipes" array`);
  } else {
    actualIds = catalog.recipes.map((r) => r.id);
    const missing = EXPECTED_RECIPE_IDS.filter((id) => !actualIds.includes(id));
    const extra = actualIds.filter((id) => !EXPECTED_RECIPE_IDS.includes(id));
    if (missing.length) {
      fail(`recipes.json missing expected IDs: ${missing.join(", ")}`);
    }
    if (extra.length) {
      // Extras are not a failure — the catalog can grow — but call them
      // out so adding new recipes prompts an EXPECTED_RECIPE_IDS bump.
      console.log(`note: recipes.json has ${extra.length} extra ID(s) not in EXPECTED_RECIPE_IDS: ${extra.join(", ")}`);
    }
  }
  validateX402Discovery(catalog);
}
console.log(`recipes.json: ${actualIds.length} recipes, ${EXPECTED_RECIPE_IDS.length} expected`);

// ---- agents.js: syntax check ----
const agentsPath = path.join(publicDir, "agents.js");
if (!existsSync(agentsPath)) {
  fail(`public/agents.js missing`);
} else {
  const result = spawnSync(process.execPath, ["--check", agentsPath], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`public/agents.js failed node --check: ${result.stderr || result.stdout || "(no stderr)"}`);
  } else {
    console.log(`agents.js: parses (${statSync(agentsPath).size} bytes)`);
  }
}

// ---- llms.txt: required sections present ----
const llmsPath = path.join(publicDir, "llms.txt");
let llmsBody = "";
try {
  llmsBody = readFileSync(llmsPath, "utf8");
} catch (err) {
  fail(`public/llms.txt failed to read: ${err.message}`);
}
const missingSections = LLMS_REQUIRED_SECTIONS.filter((s) => !llmsBody.includes(s));
if (missingSections.length) {
  fail(`llms.txt missing sections: ${missingSections.map((s) => JSON.stringify(s)).join(", ")}`);
}
const missingWalletExports = LLMS_REQUIRED_WALLET_EXPORTS.filter((s) => !llmsBody.includes(s));
if (missingWalletExports.length) {
  fail(`llms.txt wallet section missing exports: ${missingWalletExports.join(", ")}`);
}
console.log(`llms.txt: ${LLMS_REQUIRED_SECTIONS.length} sections + ${LLMS_REQUIRED_WALLET_EXPORTS.length} wallet exports present`);

// llms.txt also lists every recipe by id under "Recipe index:"; spot-check
// that each expected id appears at the start of a "- " line in the file.
for (const id of EXPECTED_RECIPE_IDS) {
  if (!new RegExp(`^- ${id}: `, "m").test(llmsBody)) {
    fail(`llms.txt recipe index missing entry for "${id}"`);
  }
}

// ---- Drift vs sibling monorepo (skipped when monorepo absent) ----
if (!existsSync(monorepoRoot)) {
  console.log(`drift check: skipped (no sibling monorepo at ${monorepoRoot})`);
} else {
  const syncScript = path.join(repoRoot, "scripts", "sync-agent-artifacts.mjs");
  const result = spawnSync(process.execPath, [syncScript, "--check"], { encoding: "utf8" });
  if (result.status !== 0) {
    const out = (result.stdout || "") + (result.stderr || "");
    fail(`agent-artifact drift detected — run \`node scripts/sync-agent-artifacts.mjs\` to refresh${out ? `\n  ${out.trim()}` : ""}`);
  } else {
    console.log(`drift check: public/ files match monorepo source`);
  }
}

// ---- HTML/JS recipe references resolve to catalog IDs ----
const htmlPath = path.join(publicDir, "index.html");
const jsPath = path.join(publicDir, "index.js");
const refRegex = /recipes\/([a-z0-9][a-z0-9-]*)/g;
const referencedIds = new Set();
for (const file of [htmlPath, jsPath]) {
  if (!existsSync(file)) continue;
  const body = readFileSync(file, "utf8");
  let m;
  while ((m = refRegex.exec(body)) !== null) {
    // Skip generated/ paths and obvious non-id tokens (index, schema, etc).
    const id = m[1];
    if (id === "index" || id === "schema") continue;
    referencedIds.add(id);
  }
}
const dangling = [...referencedIds].filter((id) => !actualIds.includes(id));
if (dangling.length) {
  fail(`public/index.{html,js} references recipe IDs absent from catalog: ${dangling.join(", ")}`);
} else if (referencedIds.size > 0) {
  console.log(`recipe references: ${referencedIds.size} unique id(s) in index.{html,js} all resolve`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("OK");
