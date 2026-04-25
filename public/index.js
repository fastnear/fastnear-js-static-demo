/** @type { import("@fastnear/api") } */
/* global near, nearWallet */
/* ^ IIFE globals loaded via <script> tags in index.html */

const SUPPORTED_NETWORKS = ["mainnet", "testnet"];
const DEFAULT_NETWORK = "mainnet";
const DEFAULT_CONTRACT_BY_NETWORK = {
  mainnet: "berryclub.ek.near",
  testnet: "count.mike.testnet",
};
const DEFAULT_CONTRACT_ID = DEFAULT_CONTRACT_BY_NETWORK[DEFAULT_NETWORK];

const NETWORK_STORAGE_KEY = "network";
const NETWORK_URL_PARAM = "network";
const CONTRACT_ID_URL_PARAM = "contract";
const CONTRACT_ID_PATTERN = /^[a-z\d]+(?:[._-][a-z\d]+)*$/;
const LEGACY_CONTRACT_ID_STORAGE_KEY = "contractId";
const LEGACY_SCOPED_CONTRACT_ID_STORAGE_KEY = "scopedContractId";
// Records which network the wallet was last signed into so we can detect a
// page-load mismatch (e.g. ?network=… URL change) and avoid using a
// mainnet account against a testnet contract.
const LAST_SIGN_IN_NETWORK_KEY = "fastnear-js:lastSignInNetwork";

function contractIdStorageKey(network) {
  return `contractId:${network}`;
}

function scopedContractIdStorageKey(network) {
  return `scopedContractId:${network}`;
}

function defaultContractFor(network) {
  return DEFAULT_CONTRACT_BY_NETWORK[network] || DEFAULT_CONTRACT_ID;
}

let currentNetwork = DEFAULT_NETWORK;
let currentContractId = defaultContractFor(currentNetwork);
let scopedContractId = null;
const contractChangeListeners = new Set();

function isValidNetwork(value) {
  return typeof value === "string" && SUPPORTED_NETWORKS.includes(value);
}

function isValidContractId(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 64 && CONTRACT_ID_PATTERN.test(trimmed);
}

function resolveInitialNetwork() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const fromUrl = params.get(NETWORK_URL_PARAM);
    if (isValidNetwork(fromUrl)) return fromUrl;
  } catch {}
  try {
    const fromStorage = globalThis.localStorage?.getItem(NETWORK_STORAGE_KEY);
    if (isValidNetwork(fromStorage)) return fromStorage;
  } catch {}
  return DEFAULT_NETWORK;
}

function resolveInitialContractId(network) {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const fromUrl = params.get(CONTRACT_ID_URL_PARAM);
    if (fromUrl && isValidContractId(fromUrl)) return fromUrl.trim();
  } catch {}
  try {
    const fromStorage = globalThis.localStorage?.getItem(contractIdStorageKey(network));
    if (fromStorage && isValidContractId(fromStorage)) return fromStorage.trim();
  } catch {}
  // Back-compat: legacy unprefixed "contractId" key predates network namespacing; consume it into mainnet.
  if (network === "mainnet") {
    try {
      const legacy = globalThis.localStorage?.getItem(LEGACY_CONTRACT_ID_STORAGE_KEY);
      if (legacy && isValidContractId(legacy)) {
        globalThis.localStorage?.setItem(contractIdStorageKey("mainnet"), legacy.trim());
        globalThis.localStorage?.removeItem(LEGACY_CONTRACT_ID_STORAGE_KEY);
        return legacy.trim();
      }
    } catch {}
  }
  return defaultContractFor(network);
}

function resolveInitialScopedContractId(network) {
  try {
    const stored = globalThis.localStorage?.getItem(scopedContractIdStorageKey(network));
    if (stored && isValidContractId(stored)) return stored.trim();
  } catch {}
  if (network === "mainnet") {
    try {
      const legacy = globalThis.localStorage?.getItem(LEGACY_SCOPED_CONTRACT_ID_STORAGE_KEY);
      if (legacy && isValidContractId(legacy)) {
        globalThis.localStorage?.setItem(scopedContractIdStorageKey("mainnet"), legacy.trim());
        globalThis.localStorage?.removeItem(LEGACY_SCOPED_CONTRACT_ID_STORAGE_KEY);
        return legacy.trim();
      }
    } catch {}
  }
  return null;
}

function persistContractId(value) {
  try {
    const key = contractIdStorageKey(currentNetwork);
    if (value && value !== defaultContractFor(currentNetwork)) {
      globalThis.localStorage?.setItem(key, value);
    } else {
      globalThis.localStorage?.removeItem(key);
    }
  } catch {}
}

function syncContractIdToUrl(value) {
  try {
    const url = new URL(globalThis.location?.href || "");
    if (value && value !== defaultContractFor(currentNetwork)) {
      url.searchParams.set(CONTRACT_ID_URL_PARAM, value);
    } else {
      url.searchParams.delete(CONTRACT_ID_URL_PARAM);
    }
    globalThis.history?.replaceState(null, "", url.toString());
  } catch {}
}

function persistNetwork(value) {
  try {
    if (value && value !== DEFAULT_NETWORK) {
      globalThis.localStorage?.setItem(NETWORK_STORAGE_KEY, value);
    } else {
      globalThis.localStorage?.removeItem(NETWORK_STORAGE_KEY);
    }
  } catch {}
}

function syncNetworkToUrl(value) {
  try {
    const url = new URL(globalThis.location?.href || "");
    if (value && value !== DEFAULT_NETWORK) {
      url.searchParams.set(NETWORK_URL_PARAM, value);
    } else {
      url.searchParams.delete(NETWORK_URL_PARAM);
    }
    // Clear the contract param — the new network has its own default; reading URL on reload
    // would otherwise keep the old-network contract. localStorage per-network preserves custom picks.
    url.searchParams.delete(CONTRACT_ID_URL_PARAM);
    globalThis.history?.replaceState(null, "", url.toString());
  } catch {}
}

function setContractId(next) {
  if (!isValidContractId(next)) return false;
  const trimmed = next.trim();
  if (trimmed === currentContractId) return false;
  currentContractId = trimmed;
  persistContractId(trimmed);
  syncContractIdToUrl(trimmed);
  for (const listener of contractChangeListeners) {
    try { listener(currentContractId); } catch (err) { console.error("contract-change listener failed:", err); }
  }
  return true;
}

function setScopedContractId(next) {
  const key = scopedContractIdStorageKey(currentNetwork);
  if (!next) {
    scopedContractId = null;
    try { globalThis.localStorage?.removeItem(key); } catch {}
    return;
  }
  if (!isValidContractId(next)) return;
  scopedContractId = next.trim();
  try { globalThis.localStorage?.setItem(key, scopedContractId); } catch {}
}

// One-time sweep of orphan keys from the previous page-side per-network
// session shim (now obsolete — the wallet library handles network-namespacing
// natively). Safe to run on every load: idempotent once the legacy keys are
// gone.
function cleanupLegacyPageStorage() {
  try {
    globalThis.localStorage?.removeItem(LAST_SIGN_IN_NETWORK_KEY);
    globalThis.localStorage?.removeItem("fastnear-js:session:mainnet");
    globalThis.localStorage?.removeItem("fastnear-js:session:testnet");
  } catch {}
}

function setNetwork(next) {
  if (!isValidNetwork(next)) return false;
  if (next === currentNetwork) return false;
  persistNetwork(next);
  syncNetworkToUrl(next);
  // Full reload: near.config + nearWallet are initialized with the current
  // network at boot. The wallet library now keys storage per-network, so each
  // network restores its own session if any.
  globalThis.location?.reload();
  return true;
}

function onContractChange(listener) {
  if (typeof listener !== "function") return () => {};
  contractChangeListeners.add(listener);
  return () => contractChangeListeners.delete(listener);
}
const DefaultBalance = "0.0000 🥑";

// "Draw Random Green Pixel" targets berryfast.near (the contract behind the
// canvas preview), not berryclub.ek.near. The visible viewport is region
// (-1, 0) crop (2, 0, 124, 46) at 8x scale, which maps to global pixel
// coords x ∈ [-126, -3], y ∈ [0, 45]. The dense face image fills y ∈ [0, 41];
// the sparse bottom strip y ∈ [42, 45] hosts the imperfect red frame and is
// mostly empty — a green pixel there appears clearly without clobbering the
// faces.
const BerryFastDrawContract = "berryfast.near";
const BerryFastDrawZone = {
  xMin: -126, xMax: -3,
  yMin: 42,   yMax: 45,
};

function randomBerryFastVisiblePixel() {
  const xRange = BerryFastDrawZone.xMax - BerryFastDrawZone.xMin + 1;
  const yRange = BerryFastDrawZone.yMax - BerryFastDrawZone.yMin + 1;
  const x = BerryFastDrawZone.xMin + Math.floor(Math.random() * xRange);
  const y = BerryFastDrawZone.yMin + Math.floor(Math.random() * yRange);
  return { x, y };
}
const berryFastApiBase = "https://api.berry.fastnear.com";
const berryFastRegionSize = 128;
const berryFastPixelStride = 6;
const berryFastPreviewRegion = { rx: -1, ry: 0 };
const berryFastPreviewCrop = { x: 2, y: 0, width: 124, height: 46 };
const berryFastPreviewScale = 8;
const walletManifest = "./manifest.json";
const walletConnect = { projectId: "4b2c7201ce4c03e0fb59895a2c251110" };

// FunctionCall access key target at sign-in. On mainnet we want the FCK
// scoped to berryfast.near so "Draw Random Green Pixel" (zero-deposit
// draw on berryfast.near) signs silently — Buy 25 🥑 on
// berryclub.ek.near has a 0.01 NEAR deposit and would pop the wallet
// regardless of FCK, so a berryclub-scoped FCK adds no value. On
// testnet the target stays count.mike.testnet (the only contract the
// counter demo touches).
const SIGN_IN_FCK_BY_NETWORK = {
  mainnet: BerryFastDrawContract,
  testnet: "count.mike.testnet",
};
function signInFckContractFor(network) {
  return SIGN_IN_FCK_BY_NETWORK[network] || defaultContractFor(network);
}

const walletOptions = {
  get network() {
    return currentNetwork;
  },
  get contractId() {
    return signInFckContractFor(currentNetwork);
  },
  manifest: walletManifest,
  walletConnect,
};

const demoConfigs = {
  mainnet: {
    sectionTitle: "Berry Club and berry.fast show the same library working in real apps.",
    sectionSummaryHtml:
      "The same FastNear JS runtime driving a live app — a berry.fast board crop and wallet-backed Berry Club actions.",
    previewTitle: "berry.fast board preview",
    cardKicker: "Wallet-backed example",
    cardTitle: "Draw or buy tokens",
    cardNote:
      "Buy 25 🥑 spends 0.01 NEAR on berryclub.ek.near. Draw paints a random green pixel onto berryfast.near (the visible board) just below the three faces.",
    signinTitle: "Sign in to draw or buy 🥑",
    signinNoteHtml:
      "Connect any wallet to try <code>draw</code> on <code>berryfast.near</code> (the visible board) and <code>buy_tokens</code> on <code>berryclub.ek.near</code> — all from the browser.",
    primaryMetric: {
      label: "Total supply",
      fetch: () => near.ft.totalSupply({ contractId: currentContractId }),
      format: (raw) => (raw ? `${(parseFloat(raw) / 1e18).toFixed(4)} 🥑` : "—"),
    },
    secondaryMetric: {
      label: "Your balance",
      requiresAccount: true,
      fetch: (accountId) => near.view({ contractId: currentContractId, methodName: "get_account", args: { account_id: accountId } }),
      format: (raw) => (raw && !isNaN(raw.avocado_balance) ? `${(parseFloat(raw.avocado_balance) / 1e18).toFixed(4)} 🥑` : DefaultBalance),
    },
    primaryAction: {
      label: "Draw Random Green Pixel",
      methodName: "draw",
      contractId: BerryFastDrawContract,
      gas: "30 Tgas",
      deposit: "0",
      buildArgs: () => {
        const { x, y } = randomBerryFastVisiblePixel();
        return { pixels: [{ x, y, color: "00FF00" }] };
      },
    },
    secondaryAction: {
      label: "Buy 25 🥑",
      methodName: "buy_tokens",
      gas: "100 Tgas",
      deposit: "0.01 NEAR",
      buildArgs: () => ({}),
    },
    showBoardPreview: true,
    disabledNoteHtml: () =>
      `Draw (writes to <code>berryfast.near</code>) and Buy (writes to <code>berryclub.ek.near</code>) only fire when the target contract above is the default <code>berryclub.ek.near</code>. Switch back to re-enable, or use the console snippets below to call <code>app.contractId</code> directly.`,
  },
  testnet: {
    sectionTitle: "A testnet counter on the same FastNear runtime.",
    sectionSummaryHtml:
      "The same library driving berry.fast — pointed at <code>count.mike.testnet</code> for a one-method demo.",
    previewTitle: "Counter preview",
    cardKicker: "Wallet-backed example",
    cardTitle: "Increase the counter",
    cardNote:
      "Live on count.mike.testnet. One zero-arg method — each tap bumps the on-chain count by 1.",
    signinTitle: "Sign in to increase the counter",
    signinNoteHtml:
      "Connect any wallet to call <code>increase</code> on <code>count.mike.testnet</code> — one zero-arg method, all from the browser.",
    primaryMetric: {
      label: "Current count",
      fetch: () => near.view({ contractId: currentContractId, methodName: "get_count", args: {} }),
      format: (raw) => (raw != null ? String(raw) : "—"),
    },
    secondaryMetric: null,
    primaryAction: {
      label: "Increase counter",
      methodName: "increase",
      gas: "100 Tgas",
      deposit: "0",
      buildArgs: () => ({}),
    },
    secondaryAction: null,
    showBoardPreview: false,
    disabledNoteHtml: () =>
      `Increase is <code>count.mike.testnet</code>-only — change the target contract back to <code>count.mike.testnet</code> to enable, or use the console snippets below to call <code>app.contractId</code> directly.`,
  },
};

function demoConfig() {
  return demoConfigs[currentNetwork] || demoConfigs[DEFAULT_NETWORK];
}

function isDefaultContract() {
  return currentContractId === defaultContractFor(currentNetwork);
}

const DOCS_BASE = "https://docs.fastnear.com";
const CANONICAL_HOSTED_ASSET_ORIGIN = "https://js.fastnear.com";
const hostedAssetPathByKey = {
  recipes: "/recipes.json",
  agents: "/agents.js",
  nearNode: "/near-node.mjs",
  llms: "/llms.txt",
  llmsFull: "/llms-full.txt",
};

const serviceDocs = {
  rpc: {
    title: "RPC",
    url: `${DOCS_BASE}/rpc`,
    cta: "Read docs",
    summary: "Canonical JSON-RPC reference and direct request shapes.",
  },
  api: {
    title: "API",
    url: `${DOCS_BASE}/api`,
    cta: "Read docs",
    summary: "FastNear aggregated account and public-key APIs.",
  },
  tx: {
    title: "Transactions",
    url: `${DOCS_BASE}/tx`,
    cta: "Read docs",
    summary: "Indexed transaction and receipt APIs.",
  },
  transfers: {
    title: "Transfers",
    url: `${DOCS_BASE}/transfers`,
    cta: "Read docs",
    summary: "Asset movement history and transfer feeds.",
  },
  neardata: {
    title: "NEAR Data",
    url: `${DOCS_BASE}/neardata`,
    cta: "Read docs",
    summary: "Recent block, shard, and chunk documents.",
  },
  "fastdata.kv": {
    title: "FastData KV",
    url: `${DOCS_BASE}/fastdata/kv`,
    cta: "Read docs",
    summary: "Indexed key-value history and exact-key lookups.",
  },
  wallet: {
    title: "Agents",
    url: `${DOCS_BASE}/agents`,
    cta: "Read docs",
    summary: "Wallet-backed flows, agent usage, and browser guidance.",
  },
};

const docsLaunchLinks = [
  {
    title: "RPC",
    family: "rpc",
    description: "Canonical JSON-RPC methods and request shapes for direct chain reads and writes.",
    url: `${DOCS_BASE}/rpc`,
  },
  {
    title: "API",
    family: "api",
    description: "FastNear REST APIs for account ownership, holdings, and public-key discovery.",
    url: `${DOCS_BASE}/api`,
  },
  {
    title: "Transactions",
    family: "tx",
    description: "Indexed transaction, receipt, and block-level execution history.",
    url: `${DOCS_BASE}/tx`,
  },
  {
    title: "Transfers",
    family: "transfers",
    description: "Transfer-specific feeds when the question is about asset movement.",
    url: `${DOCS_BASE}/transfers`,
  },
  {
    title: "NEAR Data",
    family: "neardata",
    description: "Recent block, shard, and chunk documents without stitching chain data yourself.",
    url: `${DOCS_BASE}/neardata`,
  },
  {
    title: "FastData KV",
    family: "fastdata.kv",
    description: "Indexed contract storage and exact-key history for storage-heavy investigations.",
    url: `${DOCS_BASE}/fastdata/kv`,
  },
  {
    title: "Agents",
    family: "agents",
    description: "Agent guidance, authentication posture, and API-family routing across FastNear docs.",
    url: `${DOCS_BASE}/agents`,
  },
  {
    title: "Auth & Access",
    family: "auth",
    description: "API key patterns, bearer/query auth, and shared FastNear access guidance.",
    url: `${DOCS_BASE}/auth`,
  },
];

export function getHostedAssetOrigin(origin = globalThis.window?.location?.origin) {
  if (typeof origin === "string" && /^https?:\/\//.test(origin)) {
    return origin.replace(/\/$/, "");
  }

  return CANONICAL_HOSTED_ASSET_ORIGIN;
}

export function getHostedAssetUrls(origin = getHostedAssetOrigin()) {
  return {
    recipes: `${origin}${hostedAssetPathByKey.recipes}`,
    agents: `${origin}${hostedAssetPathByKey.agents}`,
    nearNode: `${origin}${hostedAssetPathByKey.nearNode}`,
    llms: `${origin}${hostedAssetPathByKey.llms}`,
    llmsFull: `${origin}${hostedAssetPathByKey.llmsFull}`,
  };
}

export function isOffOriginUrl(url, currentOrigin = getHostedAssetOrigin()) {
  if (typeof url !== "string" || !url) {
    return false;
  }

  try {
    const resolved = new URL(url, `${currentOrigin}/`);
    return /^https?:$/.test(resolved.protocol) && resolved.origin !== currentOrigin;
  } catch {
    return false;
  }
}

function textLinkClass(url, currentOrigin = getHostedAssetOrigin()) {
  return isOffOriginUrl(url, currentOrigin) ? "text-link external-link-indicator" : "text-link";
}

export function rewriteContractIdInText(text, newContractId = currentContractId) {
  if (typeof text !== "string" || !text) return text;
  if (!newContractId || newContractId === DEFAULT_CONTRACT_ID) return text;
  return text.replaceAll(DEFAULT_CONTRACT_ID, newContractId);
}

function deepRewriteContractId(value, newContractId) {
  if (!newContractId || newContractId === DEFAULT_CONTRACT_ID) return value;
  if (typeof value === "string") return rewriteContractIdInText(value, newContractId);
  if (Array.isArray(value)) return value.map((item) => deepRewriteContractId(item, newContractId));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepRewriteContractId(value[key], newContractId);
    return out;
  }
  return value;
}

export function rewriteHostedAssetUrlsInText(text, assetUrls = getHostedAssetUrls()) {
  if (typeof text !== "string" || !text) {
    return text;
  }

  const rewritten = text
    .replaceAll(`${CANONICAL_HOSTED_ASSET_ORIGIN}/recipes.json`, assetUrls.recipes)
    .replaceAll(`${CANONICAL_HOSTED_ASSET_ORIGIN}/agents.js`, assetUrls.agents)
    .replaceAll(`${CANONICAL_HOSTED_ASSET_ORIGIN}/near-node.mjs`, assetUrls.nearNode)
    .replaceAll(`${CANONICAL_HOSTED_ASSET_ORIGIN}/llms.txt`, assetUrls.llms)
    .replaceAll(`${CANONICAL_HOSTED_ASSET_ORIGIN}/llms-full.txt`, assetUrls.llmsFull);

  const assetOrigin = getHostedAssetOrigin(new URL(assetUrls.agents).origin);
  if (assetOrigin === CANONICAL_HOSTED_ASSET_ORIGIN) {
    return rewritten;
  }

  return rewritten.replaceAll(
    `node -e "$(curl -fsSL ${assetUrls.agents})"`,
    `FASTNEAR_CDN_BASE=${assetOrigin} node -e "$(curl -fsSL ${assetUrls.agents})"`
  );
}

export function normalizeHostedCatalogForPage(generated, assetUrls = getHostedAssetUrls(), contractIdOverride = currentContractId) {
  const withAssetUrls = {
    ...generated,
    catalogUrl: assetUrls.recipes,
    support: {
      ...generated.support,
      hostedCatalogUrl: assetUrls.recipes,
      hostedAgentEntry: assetUrls.agents,
      hostedNearNodeEntry: assetUrls.nearNode,
      hostedLlmsUrl: assetUrls.llms,
      captureExample: generated.support?.captureExample
        ? {
            ...generated.support.captureExample,
            code: rewriteHostedAssetUrlsInText(generated.support.captureExample.code, assetUrls),
          }
        : generated.support?.captureExample,
    },
    recipes: (generated.recipes || []).map((recipe) => ({
      ...recipe,
      snippets: (recipe.snippets || []).map((snippet) => ({
        ...snippet,
        code: rewriteHostedAssetUrlsInText(snippet.code, assetUrls),
      })),
    })),
  };
  return deepRewriteContractId(withAssetUrls, contractIdOverride);
}

export function applyHostedAssetLinks(root = globalThis.document, assetUrls = getHostedAssetUrls()) {
  if (!root?.querySelectorAll) {
    return;
  }

  for (const link of root.querySelectorAll("[data-hosted-asset-link]")) {
    const assetKey =
      typeof link.getAttribute === "function"
        ? link.getAttribute("data-hosted-asset-link")
        : link.dataset?.hostedAssetLink;
    const href = assetUrls[assetKey];

    if (!href) {
      continue;
    }

    if (typeof link.setAttribute === "function") {
      link.setAttribute("href", href);
    }
    link.href = href;
  }
}

let restoreReady = Promise.resolve();
let recipeTitleLookup = new Map();
const themeStorageKey = "theme";
const legacyThemeStorageKey = "fastnear:theme";
const THEME = {
  DARK: "dark",
  LIGHT: "light",
};

function themeToggleIcon(theme) {
  if (theme === THEME.DARK) {
    return `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    `;
  }

  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  `;
}

function getStoredTheme() {
  const storedTheme = localStorage.getItem(themeStorageKey) || localStorage.getItem(legacyThemeStorageKey);
  if (!localStorage.getItem(themeStorageKey) && (storedTheme === THEME.DARK || storedTheme === THEME.LIGHT)) {
    localStorage.setItem(themeStorageKey, storedTheme);
    localStorage.removeItem(legacyThemeStorageKey);
  }
  return storedTheme;
}

function applyTheme(theme) {
  document.documentElement.classList.toggle(THEME.DARK, theme === THEME.DARK);
  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    toggle.innerHTML = themeToggleIcon(theme);
    toggle.setAttribute("aria-label", "Toggle theme");
    toggle.setAttribute("title", `Switch to ${theme === THEME.DARK ? THEME.LIGHT : THEME.DARK} mode`);
    toggle.dataset.theme = theme;
  });
}

function setupThemeToggle() {
  const initialTheme = getStoredTheme() === THEME.DARK ? THEME.DARK : THEME.LIGHT;
  applyTheme(initialTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    if (toggle.dataset.ready === "true") {
      return;
    }

    toggle.addEventListener("click", () => {
      const nextTheme = document.documentElement.classList.contains(THEME.DARK) ? THEME.LIGHT : THEME.DARK;
      localStorage.setItem(themeStorageKey, nextTheme);
      applyTheme(nextTheme);
    });

    toggle.dataset.ready = "true";
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function authLabel(auth) {
  switch (auth) {
    case "wallet+deposit":
      return "Wallet + deposit";
    case "wallet":
      return "Wallet";
    case "none":
    default:
      return "No auth";
  }
}

function environmentLabel(snippet) {
  switch (snippet.environment) {
    case "curl":
      return "curl + jq";
    case "curlJson":
      return "Full JSON";
    case "browserGlobal":
      return "Browser global";
    case "rawTerminal":
      return "Raw near.js";
    case "esm":
      return "ESM";
    case "terminal":
    default:
      return "Terminal";
  }
}

function getSnippet(recipe, snippetId) {
  return recipe.snippets.find((snippet) => snippet.id === snippetId) || null;
}

function getServiceMeta(serviceId) {
  return serviceDocs[serviceId] || {
    title: serviceId,
    url: `${DOCS_BASE}/agents`,
    cta: "Read docs",
    summary: "",
  };
}

function getDiscoveryCopy(entry) {
  switch (entry.step) {
    case 1:
      return {
        label: "Read llms.txt",
        detail: "Start with the short overview and core entrypoints.",
      };
    case 2:
      return {
        label: "Open recipes.json",
        detail: "Pick the smallest runnable task for the question.",
      };
    case 3:
      return {
        label: "Run agents.js",
        detail: "Use JS when you want to branch, loop, or reshape objects.",
      };
    case 4:
      return {
        label: "Use curl + jq",
        detail: "Use raw transport when you want shell-native filtering.",
      };
    default:
      return {
        label: entry.label,
        detail: entry.detail,
      };
  }
}

function calloutIcon(variant) {
  const pathByVariant = {
    info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    warning: "M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 0 0 3.66 18h16.68a1 1 0 0 0 .87-1.14l-7.5-13a1 1 0 0 0-1.74 0Z",
    success: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    error: "M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  };

  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="${pathByVariant[variant] || pathByVariant.info}" />
    </svg>
  `;
}

function buildCallout({ variant = "info", title, bodyHtml, compact = false }) {
  return `
    <div class="callout callout-${escapeHtml(variant)}${compact ? " callout-compact" : ""}">
      <span class="callout-icon">${calloutIcon(variant)}</span>
      <div class="callout-copy">
        ${title ? `<strong class="callout-title">${escapeHtml(title)}</strong>` : ""}
        ${bodyHtml ? `<p class="callout-body">${bodyHtml}</p>` : ""}
      </div>
    </div>
  `;
}

function buildSnippetNotes(snippet) {
  const notes = [];

  if (!snippet.runnable) {
    notes.push(
      buildCallout({
        variant: "info",
        title: "Browser required",
        bodyHtml: "Run this snippet in a browser context instead of the hosted terminal wrapper.",
        compact: true,
      })
    );
  }

  if (snippet.status === "pending_publish") {
    notes.push(
      buildCallout({
        variant: "warning",
        title: "Pending public CDN publish",
        bodyHtml: "This path depends on the updated public CDN bundle being live.",
        compact: true,
      })
    );
  }

  return notes.join("");
}

function renderPillList(items, { related = false } = {}) {
  return items.map((item) => {
    if (related) {
      const title = recipeTitleLookup.get(item) || item;
      return `<a class="token-link" href="#recipe-${escapeHtml(item)}">${escapeHtml(title)}</a>`;
    }
    return `<span class="token-pill"><code>${escapeHtml(item)}</code></span>`;
  }).join("");
}

const CODE_ICON_COPY = `<svg class="code-action-icon code-action-icon--copy" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>`;
const CODE_ICON_CHECK = `<svg class="code-action-icon code-action-icon--check" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>`;
const CODE_ICON_WRAP = `<svg class="code-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3l3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"/></svg>`;

function buildCodeBlock(codeId, code) {
  return `
    <div class="code-block">
      <pre class="code-card-body"><code id="${codeId}">${escapeHtml(code)}</code></pre>
      <div class="code-actions">
        <button class="code-action code-wrap-button" type="button" title="Toggle word wrap" aria-label="Toggle word wrap" aria-pressed="false" hidden>${CODE_ICON_WRAP}</button>
        <button class="code-action code-copy-button" type="button" title="Copy" aria-label="Copy code to clipboard" data-clipboard-target="#${codeId}">${CODE_ICON_COPY}${CODE_ICON_CHECK}</button>
      </div>
    </div>`;
}

export function refreshCodeWrapButtons() {
  document.querySelectorAll(".code-block").forEach((block) => {
    const pre = block.querySelector(".code-card-body");
    const btn = block.querySelector(".code-wrap-button");
    if (!pre || !btn) return;
    const isWrapped = pre.classList.contains("is-wrapped");
    const canScroll = pre.scrollWidth > pre.clientWidth + 1;
    btn.hidden = !(isWrapped || canScroll);
  });
}

function buildQuickstartCard({ codeId, kicker, title, summary, snippet }) {
  const noteMarkup = buildSnippetNotes(snippet);

  return `
    <article class="code-card starter-card">
      <div class="code-card-head">
        <div>
          <div class="card-kicker">${escapeHtml(kicker)}</div>
          <h3 class="code-card-title">${escapeHtml(title)}</h3>
          <p class="code-card-context">${escapeHtml(summary)}</p>
          <div class="code-card-meta">${escapeHtml(environmentLabel(snippet))}</div>
          ${noteMarkup ? `<div class="code-card-notes">${noteMarkup}</div>` : ""}
        </div>
      </div>
      ${buildCodeBlock(codeId, snippet.code)}
    </article>
  `;
}

function buildQuickstartSupportCard(support) {
  return `
    <article class="card quickstart-support">
      <div class="card-kicker">Start here</div>
      <h3 class="card-title">Use these entrypoints in order.</h3>
      <div class="support-actions">
        <a class="button-primary" href="${escapeHtml(support.hostedCatalogUrl)}" rel="noopener noreferrer" target="_blank">Open recipes.json</a>
        <a class="button-secondary" href="${escapeHtml(support.hostedAgentEntry)}" rel="noopener noreferrer" target="_blank">Open agents.js</a>
        <a class="button-secondary" href="${escapeHtml(support.hostedLlmsUrl || `${CANONICAL_HOSTED_ASSET_ORIGIN}/llms.txt`)}" rel="noopener noreferrer" target="_blank">Open llms.txt</a>
      </div>
      <div class="support-note">
        ${buildCallout({
          variant: "info",
          title: "Set your FastNear API key",
          bodyHtml: `${escapeHtml(support.apiKeySummary || `Set ${support.apiKeyEnvVar} before running the authenticated snippets.`).replace(
            support.apiKeyEnvVar,
            `<code>${escapeHtml(support.apiKeyEnvVar)}</code>`
          )} Free trial credits are available at <a class="${escapeHtml(textLinkClass(support.trialCreditsUrl))}" href="${escapeHtml(support.trialCreditsUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(support.trialCreditsLabel)}</a>.`,
          compact: true,
        })}
      </div>
      <ol class="support-steps">
        ${support.discoveryOrder.map((entry) => {
          const discoveryCopy = getDiscoveryCopy(entry);
          return `
          <li>
            <strong class="support-step-label">${escapeHtml(discoveryCopy.label)}</strong>
            <span class="support-step-detail">${escapeHtml(discoveryCopy.detail)}</span>
          </li>
        `;
        }).join("")}
      </ol>
    </article>
  `;
}

function familyBadgeClass(id) {
  return `family-badge family-badge--${String(id).replace(/\./g, "-")}`;
}

function buildFamilyCard(family) {
  const docs = getServiceMeta(family.id);
  const authStyle = family.authStyle === "query" ? "Query auth" : family.authStyle === "bearer" ? "Bearer auth" : family.authStyle;

  return `
    <article class="card surface-card">
      <div class="surface-head">
        <div>
          <span class="${familyBadgeClass(family.id)}">${escapeHtml(family.id)}</span>
          <h3 class="card-title">${escapeHtml(docs.title)}</h3>
        </div>
        <a class="button-secondary button-small" href="${escapeHtml(docs.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(docs.cta)}</a>
      </div>
      <p class="card-summary">${escapeHtml(family.summary)}</p>
      <div class="meta-row">
        <span class="badge-pill badge-pill-strong">${escapeHtml(authStyle)}</span>
        <span class="badge-pill badge-pill-subtle">Pagination: ${escapeHtml(family.pagination.kind)}</span>
      </div>
      <ul class="surface-list">
        ${family.bestFor.slice(0, 3).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
      </ul>
      <div class="surface-entrypoints">
        ${renderPillList(family.entrypoints.slice(0, 4))}
      </div>
    </article>
  `;
}

function buildDocsCard(entry) {
  const badgeClass = entry.family ? familyBadgeClass(entry.family) : "family-badge";
  return `
    <a class="card docs-card" href="${escapeHtml(entry.url)}" rel="noopener noreferrer" target="_blank">
      <span class="${badgeClass}">${escapeHtml(entry.title)}</span>
      <p class="card-summary">${escapeHtml(entry.description)}</p>
      <span class="text-link docs-card-link">Read docs</span>
    </a>
  `;
}

function buildRecipeSnippetCard(recipe, snippet) {
  const codeId = `recipe-${recipe.id}-${snippet.id}-code`;
  const noteMarkup = buildSnippetNotes(snippet);

  return `
    <article class="code-card snippet-card">
      <div class="code-card-head">
        <div>
          <div class="card-kicker">${escapeHtml(snippet.label)}</div>
          <div class="code-card-meta">${escapeHtml(environmentLabel(snippet))}</div>
          ${noteMarkup ? `<div class="code-card-notes">${noteMarkup}</div>` : ""}
        </div>
      </div>
      ${buildCodeBlock(codeId, snippet.code)}
    </article>
  `;
}

function buildRecipeAssist(recipe) {
  const isWalletBacked = recipe.auth === "wallet" || recipe.auth === "wallet+deposit";

  if (!isWalletBacked) {
    return "";
  }

  if (recipe.id === "connect-wallet") {
    return `
      <div class="recipe-assist">
        ${buildCallout({
          variant: "info",
          title: "Browser-only step",
          bodyHtml: `The quickest working path here is the Sign in control on this page. The snippet below expects a browser page that already loaded <code>near.js</code> and <code>wallet.js</code>.`,
          compact: true,
        })}
        <div class="recipe-assist-actions">
          <button class="button-primary button-small" data-recipe-connect="true" type="button">Try sign in on this page</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="recipe-assist">
      ${buildCallout({
        variant: "info",
        title: "Browser-only task",
        bodyHtml: `Connect a wallet on this page first, then run this snippet in a browser app that already loaded <code>near.js</code> and <code>wallet.js</code>.`,
        compact: true,
      })}
    </div>
  `;
}

function getPrimaryRecipeSnippet(recipe) {
  const snippets = recipe.snippets || [];
  const isWalletBacked = recipe.auth === "wallet" || recipe.auth === "wallet+deposit";

  if (isWalletBacked) {
    return (
      getSnippet(recipe, "browser-global") ||
      getSnippet(recipe, "esm") ||
      getSnippet(recipe, "terminal") ||
      getSnippet(recipe, "curl-jq") ||
      snippets[0] ||
      null
    );
  }

  return (
    getSnippet(recipe, "terminal") ||
    getSnippet(recipe, "curl-jq") ||
    getSnippet(recipe, "browser-global") ||
    snippets[0] ||
    null
  );
}

function getLandingRecipes(recipes) {
  return (recipes || []).filter((recipe) => recipe.id !== "view-contract");
}

function buildRecipeCard(recipe) {
  const serviceMeta = getServiceMeta(recipe.service);
  const primaryChoice = recipe.chooseWhen.slice(0, 2);
  const primaryNote = recipe.responseNotes[0] || "";
  const primarySnippet = getPrimaryRecipeSnippet(recipe);
  const assistMarkup = buildRecipeAssist(recipe);
  const secondaryMeta = [`Returns ${recipe.returns}`, recipe.network];
  const relatedMarkup = recipe.relatedRecipes?.length
    ? `
      <div class="token-row token-row-secondary">
        <span class="detail-label">Related</span>
        <div class="token-group token-group-secondary">${renderPillList(recipe.relatedRecipes, { related: true })}</div>
      </div>
    `
    : "";

  return `
    <article class="card recipe-card" id="recipe-${escapeHtml(recipe.id)}">
      <div class="recipe-head">
        <div class="recipe-copy">
          <div class="card-kicker">${escapeHtml(recipe.api)}</div>
          <h3 class="card-title">${escapeHtml(recipe.title)}</h3>
          <p class="card-summary">${escapeHtml(recipe.summary)}</p>
        </div>
        <div class="recipe-actions">
          <div class="meta-row">
            <span class="${familyBadgeClass(recipe.service)}">${escapeHtml(serviceMeta.title)}</span>
            <span class="family-badge family-badge--auth-tag">${escapeHtml(authLabel(recipe.auth))}</span>
          </div>
          <a class="text-link external-link-indicator" href="${escapeHtml(serviceMeta.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(serviceMeta.cta)}</a>
        </div>
      </div>

      <div class="recipe-meta-inline">
        ${secondaryMeta.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("<span class=\"recipe-meta-divider\">&middot;</span>")}
      </div>

      <div class="detail-block recipe-detail-block">
        <span class="detail-label">Choose this when</span>
        <ul class="detail-list">
          ${primaryChoice.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
        </ul>
      </div>

      ${primaryNote ? `<p class="recipe-note">${escapeHtml(primaryNote)}</p>` : ""}

      <div class="token-row">
        <span class="detail-label">Output keys</span>
        <div class="token-group">${renderPillList(recipe.outputKeys)}</div>
      </div>

      ${relatedMarkup}
      ${assistMarkup}

      ${primarySnippet ? `<div class="snippet-stack">${buildRecipeSnippetCard(recipe, primarySnippet)}</div>` : ""}
    </article>
  `;
}

function buildCatalogNote(generated) {
  return `
    <p class="catalog-note-copy">
      These task helpers are synced from
      <a class="${escapeHtml(textLinkClass(generated.catalogUrl))}" href="${escapeHtml(generated.catalogUrl)}" rel="noopener noreferrer" target="_blank">recipes.json</a>
      and stay aligned with
      <a class="${escapeHtml(textLinkClass(generated.support.hostedAgentEntry))}" href="${escapeHtml(generated.support.hostedAgentEntry)}" rel="noopener noreferrer" target="_blank">agents.js</a>,
      <a class="${escapeHtml(textLinkClass(generated.support.hostedLlmsUrl || `${CANONICAL_HOSTED_ASSET_ORIGIN}/llms.txt`))}" href="${escapeHtml(generated.support.hostedLlmsUrl || `${CANONICAL_HOSTED_ASSET_ORIGIN}/llms.txt`)}" rel="noopener noreferrer" target="_blank">llms.txt</a>,
      and the broader FastNear docs. Start with the lower-level families above when you want exact control; use these helpers when you want the shortest task path. The full snippet variants stay in the catalog even though this landing page shows one primary path per task.
    </p>
  `;
}

function buildFallbackCard(title, body) {
  return `
    <div class="fallback-card">
      ${buildCallout({
        variant: "error",
        title,
        bodyHtml: escapeHtml(body),
      })}
    </div>
  `;
}

let cachedRawCatalog = null;

function renderNormalizedCatalog(generated) {
  const quickstart = document.getElementById("hero-quickstart");
  const surfaces = document.getElementById("surface-grid");
  const guidance = document.getElementById("agent-guidance");
  const container = document.getElementById("agent-recipes");

  if (!quickstart || !surfaces || !guidance || !container) return;

  recipeTitleLookup = new Map(
    (generated.recipes || []).map((recipe) => [recipe.id, recipe.title])
  );

  const starterRecipe = generated.recipes.find((recipe) => recipe.id === "view-contract");
  const terminalSnippet = starterRecipe ? getSnippet(starterRecipe, "terminal") : null;
  const curlSnippet = starterRecipe ? getSnippet(starterRecipe, "curl-jq") : null;

  quickstart.innerHTML = [
    terminalSnippet
      ? buildQuickstartCard({
          codeId: "hero-terminal-snippet",
          kicker: "agents.js",
          title: "Run FastNear JS in one terminal command",
          summary: "Use the hosted agent wrapper, work with normal JavaScript objects, and keep the next step in JS.",
          snippet: terminalSnippet,
        })
      : buildFallbackCard("Terminal starter unavailable", "The generated catalog did not include the expected terminal starter snippet."),
    curlSnippet
      ? buildQuickstartCard({
          codeId: "hero-curl-snippet",
          kicker: "curl + jq",
          title: "Use raw HTTP with curl + jq",
          summary: "Stay close to the wire format when you want shell-native filtering, quick surveys, or a direct request you can adapt.",
          snippet: curlSnippet,
        })
      : buildFallbackCard("curl starter unavailable", "The generated catalog did not include the expected curl + jq starter snippet."),
    buildQuickstartSupportCard(generated.support),
  ].join("");

  surfaces.innerHTML = (generated.families || []).map(buildFamilyCard).join("");
  guidance.innerHTML = buildCatalogNote(generated);
  container.innerHTML = getLandingRecipes(generated.recipes).map(buildRecipeCard).join("");

  refreshCodeWrapButtons();
}

export function rerenderRecipesForContract() {
  if (!cachedRawCatalog) return;
  const assetUrls = getHostedAssetUrls();
  renderNormalizedCatalog(normalizeHostedCatalogForPage(cachedRawCatalog, assetUrls, currentContractId));
}

export async function renderAgentRecipes() {
  const quickstart = document.getElementById("hero-quickstart");
  const surfaces = document.getElementById("surface-grid");
  const docsLaunch = document.getElementById("docs-launch");
  const guidance = document.getElementById("agent-guidance");
  const container = document.getElementById("agent-recipes");

  if (!quickstart || !surfaces || !docsLaunch || !guidance || !container) {
    return;
  }

  const assetUrls = getHostedAssetUrls();
  applyHostedAssetLinks(document, assetUrls);

  docsLaunch.innerHTML = docsLaunchLinks.map(buildDocsCard).join("");

  try {
    const response = await fetch(assetUrls.recipes);
    if (!response.ok) {
      throw new Error(`Failed to load generated recipes: ${response.status} ${response.statusText}`);
    }

    cachedRawCatalog = await response.json();
    renderNormalizedCatalog(normalizeHostedCatalogForPage(cachedRawCatalog, assetUrls, currentContractId));
  } catch (error) {
    console.error("Could not render agent recipes:", error);

    quickstart.innerHTML = buildFallbackCard(
      "Starter snippets unavailable",
      "The hosted recipe catalog could not be loaded. Open recipes.json directly or sync the generated artifacts."
    );
    surfaces.innerHTML = buildFallbackCard(
      "API family picker unavailable",
      "The generated family metadata could not be loaded from recipes.json."
    );
    guidance.innerHTML = "";
    container.innerHTML = buildFallbackCard(
      "Task catalog unavailable",
      "Sync the generated artifacts from the monorepo and reload the page."
    );
  }
}

export function wireUpAppEarly(configOpts) {
  currentNetwork = resolveInitialNetwork();
  currentContractId = resolveInitialContractId(currentNetwork);
  scopedContractId = resolveInitialScopedContractId(currentNetwork);

  globalThis.app = {
    get network() { return currentNetwork; },
    get contractId() { return currentContractId; },
    get scopedContractId() { return scopedContractId; },
    setContract(next) { return setContractId(next); },
    setNetwork(next) { return setNetwork(next); },
  };

  cleanupLegacyPageStorage();

  const defaultConfig = { networkId: currentNetwork };
  const updatedConfig = { ...defaultConfig, ...configOpts };
  near.config(updatedConfig);

  restoreReady = nearWallet.restore(walletOptions)
    .then((result) => {
      if (result) console.log("Restored wallet session:", result.accountId);
    })
    .catch((err) => {
      console.warn("Wallet restore failed:", err);
    });
}

export function wireUpAppLate() {
  const cu = near.utils.convertUnit;
  setupThemeToggle();
  setupScrollHeader();

  function closeHeaderMenus() {
    document
      .querySelectorAll("[data-auth-container].open, [data-config-container].open")
      .forEach((container) => {
        container.classList.remove("open");
      });
    document.querySelectorAll("[data-config-toggle]").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function setupShellInteractions() {
    if (document.body.dataset.shellInteractionsReady === "true") {
      return;
    }

    document.addEventListener("click", async (event) => {
      const signOutButton = event.target.closest("[data-auth-signout]");
      if (signOutButton) {
        event.preventDefault();
        event.stopPropagation();
        closeHeaderMenus();
        // Scope to the current page network so a parallel session on the
        // other network is preserved. The library's onDisconnect listener
        // (registered in wireUpAppLate) drives the re-render — no reload.
        await nearWallet.disconnect({ network: currentNetwork });
        return;
      }

      const signInButton = event.target.closest("[data-auth-signin]");
      if (signInButton) {
        event.preventDefault();
        event.stopPropagation();
        setScopedContractId(currentContractId);
        await nearWallet.connect(walletOptions);
        updateUI();
        return;
      }

      const recipeConnectButton = event.target.closest("[data-recipe-connect]");
      if (recipeConnectButton) {
        event.preventDefault();
        event.stopPropagation();
        setScopedContractId(currentContractId);
        await nearWallet.connect(walletOptions);
        return;
      }

      const networkSwitch = event.target.closest("[data-network-switch]");
      if (networkSwitch) {
        event.preventDefault();
        event.stopPropagation();
        const next = networkSwitch.getAttribute("data-network-switch");
        if (next && next !== currentNetwork) {
          setScopedContractId(null);
          setNetwork(next);
        }
        return;
      }

      const configToggle = event.target.closest("[data-config-toggle]");
      if (configToggle) {
        event.preventDefault();
        event.stopPropagation();
        const container = configToggle.closest("[data-config-container]");
        const wasOpen = container?.classList.contains("open");
        closeHeaderMenus();
        if (container && !wasOpen) {
          container.classList.add("open");
          configToggle.setAttribute("aria-expanded", "true");
        }
        return;
      }

      const authToggle = event.target.closest("[data-auth-toggle]");
      if (authToggle) {
        event.preventDefault();
        event.stopPropagation();
        const container = authToggle.closest("[data-auth-container]");
        const isOpen = container?.classList.contains("open");
        closeHeaderMenus();
        if (container && !isOpen) {
          container.classList.add("open");
        }
        return;
      }

      if (!event.target.closest("[data-auth-container], [data-config-container]")) {
        closeHeaderMenus();
      }
    });

    const showContractHint = (input, message) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.setAttribute("aria-invalid", "true");
      const where = input.getAttribute("data-contract-input") || "top";
      const hint = document.querySelector(`[data-contract-input-hint="${where}"]`);
      if (hint) {
        hint.textContent = message;
        hint.hidden = false;
      }
    };

    const clearContractHint = (input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.removeAttribute("aria-invalid");
      const where = input.getAttribute("data-contract-input") || "top";
      const hint = document.querySelector(`[data-contract-input-hint="${where}"]`);
      if (hint) {
        hint.textContent = "";
        hint.hidden = true;
      }
    };

    const commitContractInput = (input, { revertOnInvalid }) => {
      if (!(input instanceof HTMLInputElement)) return false;
      const raw = (input.value || "").trim();
      if (!raw) {
        if (revertOnInvalid) input.value = currentContractId;
        clearContractHint(input);
        return false;
      }
      if (!isValidContractId(raw)) {
        if (revertOnInvalid) {
          input.value = currentContractId;
          clearContractHint(input);
        } else {
          showContractHint(input, "Not a valid NEAR account id");
        }
        return false;
      }
      clearContractHint(input);
      if (raw !== currentContractId) {
        setContractId(raw);
      } else {
        input.value = raw;
      }
      return true;
    };

    document.addEventListener("input", (event) => {
      const input = event.target instanceof HTMLInputElement && event.target.hasAttribute("data-contract-input")
        ? event.target
        : null;
      if (input) clearContractHint(input);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openMenu = document.querySelector("[data-auth-container].open, [data-config-container].open");
      if (!openMenu) return;
      closeHeaderMenus();
      const trigger = openMenu.querySelector("[data-config-toggle], [data-auth-toggle]");
      if (trigger instanceof HTMLElement) trigger.focus();
    });

    document.addEventListener("keydown", (event) => {
      const input = event.target instanceof HTMLInputElement && event.target.hasAttribute("data-contract-input")
        ? event.target
        : null;
      if (!input) return;
      if (event.key === "Enter") {
        event.preventDefault();
        commitContractInput(input, { revertOnInvalid: false });
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.value = currentContractId;
        clearContractHint(input);
        input.blur();
      }
    });

    document.addEventListener("focusout", (event) => {
      const input = event.target instanceof HTMLInputElement && event.target.hasAttribute("data-contract-input")
        ? event.target
        : null;
      if (!input) return;
      commitContractInput(input, { revertOnInvalid: true });
    });

    document.body.dataset.shellInteractionsReady = "true";
  }

  function setupScrollHeader() {
    const hero = document.querySelector(".hero-shell");
    if (!hero) {
      return;
    }

    const updateScrollState = () => {
      const threshold = Math.max(64, hero.offsetTop - 28);
      document.body.classList.toggle("show-sticky-header", window.scrollY > threshold);
    };

    if (document.body.dataset.scrollHeaderReady !== "true") {
      let scheduled = false;
      const requestUpdate = () => {
        if (scheduled) {
          return;
        }
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          updateScrollState();
        });
      };

      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", requestUpdate);
      document.body.dataset.scrollHeaderReady = "true";
    }

    updateScrollState();
  }

  setupShellInteractions();

  function intToColor(c) {
    return `#${c.toString(16).padStart(6, "0")}`;
  }

  function decodeLine(line) {
    const binary = atob(line);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buf[i] = binary.charCodeAt(i);
    }
    const pixels = [];
    for (let i = 4; i < buf.length; i += 8) {
      const color =
        buf[i] |
        (buf[i + 1] << 8) |
        (buf[i + 2] << 16) |
        (buf[i + 3] << 24);
      pixels.push(
        `<div class="pixel" style="background-color:${intToColor(color)}"></div>`
      );
    }
    return pixels.join("");
  }

  function decodeBerryFastRegion(regionBuffer) {
    const bytes = new Uint8Array(regionBuffer);
    const image = new ImageData(berryFastRegionSize, berryFastRegionSize);
    const pixels = image.data;

    for (let index = 0; index < berryFastRegionSize * berryFastRegionSize; index += 1) {
      const sourceOffset = index * berryFastPixelStride;
      const targetOffset = index * 4;
      const isDrawn =
        bytes[sourceOffset + 3] !== 0 ||
        bytes[sourceOffset + 4] !== 0 ||
        bytes[sourceOffset + 5] !== 0;

      pixels[targetOffset] = isDrawn ? bytes[sourceOffset] : 0;
      pixels[targetOffset + 1] = isDrawn ? bytes[sourceOffset + 1] : 0;
      pixels[targetOffset + 2] = isDrawn ? bytes[sourceOffset + 2] : 0;
      pixels[targetOffset + 3] = 255;
    }

    return image;
  }

  function renderBerryFastBoardPreview(canvas, regionImage) {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const { x, y, width, height } = berryFastPreviewCrop;
    const scale = berryFastPreviewScale;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = berryFastRegionSize;
    sourceCanvas.height = berryFastRegionSize;
    sourceCanvas.getContext("2d").putImageData(regionImage, 0, 0);

    canvas.width = width * scale;
    canvas.height = height * scale;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, x, y, width, height, 0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let gridX = 0; gridX <= width; gridX += 1) {
      const offset = gridX * scale + 0.5;
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset, canvas.height);
      context.stroke();
    }

    for (let gridY = 0; gridY <= height; gridY += 1) {
      const offset = gridY * scale + 0.5;
      context.beginPath();
      context.moveTo(0, offset);
      context.lineTo(canvas.width, offset);
      context.stroke();
    }
  }

  async function fetchBerryFastPreviewRegion() {
    const response = await fetch(
      `${berryFastApiBase}/api/region/${berryFastPreviewRegion.rx}/${berryFastPreviewRegion.ry}`
    );

    if (!response.ok) {
      throw new Error(`Failed to load berry.fast preview: ${response.status} ${response.statusText}`);
    }

    return {
      image: decodeBerryFastRegion(await response.arrayBuffer()),
      lastUpdated: parseInt(response.headers.get("x-last-updated") || "0", 10),
    };
  }

  // After a Draw lands on chain, the berry.fast indexer takes a few seconds
  // to ingest the block. Poll the region API until x-last-updated advances
  // past the pre-draw timestamp (or give up after ~15s) so the user sees
  // their pixel without manually reloading.
  async function pollBoardUntilUpdated() {
    const board = document.getElementById("near-el-board");
    if (!(board instanceof HTMLCanvasElement)) return;
    let baseline = 0;
    try {
      const initial = await fetchBerryFastPreviewRegion();
      baseline = initial.lastUpdated;
      renderBerryFastBoardPreview(board, initial.image);
    } catch (err) {
      console.error("Failed to read initial berry.fast preview for poll:", err);
      return;
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!demoConfig().showBoardPreview) return;
      try {
        const next = await fetchBerryFastPreviewRegion();
        if (next.lastUpdated > baseline) {
          renderBerryFastBoardPreview(board, next.image);
          return;
        }
      } catch (err) {
        // transient indexer/network error — keep trying until the deadline
      }
    }
  }

  function renderContractSlots() {
    const slots = document.querySelectorAll("[data-contract-slot]");
    if (!slots.length) return;
    slots.forEach((slot) => {
      const where = slot.getAttribute("data-contract-slot") || "top";
      slot.innerHTML = `
        <label class="contract-input-label" for="contract-input-${where}">Target contract</label>
        <input
          id="contract-input-${where}"
          class="contract-input"
          type="text"
          value="${escapeHtml(currentContractId)}"
          aria-label="Target NEAR contract id"
          data-contract-input="${where}"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
          autocomplete="off"
          inputmode="url"
          size="18"
        />
        <span class="contract-input-hint" data-contract-input-hint="${where}" hidden></span>
      `;
    });
  }

  function renderNetworkSlots() {
    const slots = document.querySelectorAll("[data-network-slot]");
    if (!slots.length) return;
    slots.forEach((slot) => {
      slot.innerHTML = `
        <span class="network-toggle-label">Network</span>
        <div class="network-toggle" role="group" aria-label="Network">
          ${SUPPORTED_NETWORKS.map((network) => {
            const isActive = network === currentNetwork;
            const label = network.charAt(0).toUpperCase() + network.slice(1);
            return `<button
              type="button"
              class="network-option${isActive ? " is-active" : ""}"
              data-network-switch="${network}"
              aria-pressed="${isActive ? "true" : "false"}"
            >${label}</button>`;
          }).join("")}
        </div>
      `;
    });
  }

  function syncContractInputs(value) {
    document.querySelectorAll("[data-contract-input]").forEach((input) => {
      if (input instanceof HTMLInputElement && input.value !== value && document.activeElement !== input) {
        input.value = value;
      }
      input.removeAttribute("aria-invalid");
    });
    document.querySelectorAll("[data-contract-input-hint]").forEach((hint) => {
      hint.textContent = "";
      hint.hidden = true;
    });
  }

  async function updateUI() {
    const authSlots = document.querySelectorAll("[data-auth-slot]");

    await restoreReady;

    if (!authSlots.length) {
      return;
    }

    closeHeaderMenus();

    if (nearWallet.isConnected({ network: currentNetwork })) {
      const accountId = nearWallet.accountId({ network: currentNetwork });
      const scopeMismatch = scopedContractId && scopedContractId !== currentContractId;
      const scopeHint = scopeMismatch
        ? `popup expected on ${escapeHtml(currentContractId)}`
        : "";
      const pillTitle = scopeMismatch
        ? `Session key signs zero-deposit calls to ${scopedContractId}; sending a transaction to ${currentContractId} will open a wallet popup.`
        : "";
      authSlots.forEach((authSlot) => {
        authSlot.innerHTML = `
        <button class="auth-pill${scopeMismatch ? " auth-pill-mismatch" : ""}" data-auth-toggle="true" type="button"${pillTitle ? ` title="${escapeHtml(pillTitle)}"` : ""}>
          <span class="auth-account-name">${escapeHtml(accountId)}</span>
          ${scopeHint ? `<span class="auth-scope-hint${scopeMismatch ? " auth-scope-hint-warning" : ""}">${scopeHint}</span>` : ""}
        </button>
        <div class="auth-dropdown">
          <button class="signout-button" data-auth-signout="true" type="button">Sign Out</button>
        </div>
      `;
      });
    } else {
      authSlots.forEach((authSlot) => {
        authSlot.innerHTML = `
        <button class="auth-pill auth-signin" data-auth-signin="true" type="button">
          Sign In
        </button>
      `;
      });
    }

    const config = demoConfig();
    const atDefault = isDefaultContract();
    const accountId = nearWallet.accountId({ network: currentNetwork });
    const isConnected = nearWallet.isConnected({ network: currentNetwork });
    const demoMode = !isConnected ? "signin" : atDefault ? "interactive" : "custom";

    document.body.classList.toggle("is-signed-in", isConnected);
    const actionsCard = document.querySelector('[data-demo-card="actions"]');
    if (actionsCard) actionsCard.setAttribute("data-demo-mode", demoMode);

    if (demoMode === "custom") {
      const acctEl = document.getElementById("demo-custom-account");
      const contractEl = document.getElementById("demo-custom-contract");
      if (acctEl) acctEl.textContent = accountId ?? "—";
      if (contractEl) contractEl.textContent = currentContractId;
    }

    const sectionTitleEl = document.querySelector("[data-demo-section-title]");
    if (sectionTitleEl) sectionTitleEl.textContent = config.sectionTitle;
    const sectionSummaryEl = document.querySelector("[data-demo-section-summary]");
    if (sectionSummaryEl) sectionSummaryEl.innerHTML = config.sectionSummaryHtml;
    const previewTitleEl = document.querySelector("[data-demo-preview-title]");
    if (previewTitleEl) previewTitleEl.textContent = config.previewTitle;

    const titleEl = document.querySelector("[data-demo-title]");
    if (titleEl) titleEl.textContent = config.cardTitle;
    const demoNoteEl = document.querySelector("[data-demo-note]");
    if (demoNoteEl) demoNoteEl.textContent = config.cardNote;
    const signinTitleEl = document.querySelector("[data-demo-signin-title]");
    if (signinTitleEl) signinTitleEl.textContent = config.signinTitle;
    const signinNoteEl = document.querySelector("[data-demo-signin-note]");
    if (signinNoteEl) signinNoteEl.innerHTML = config.signinNoteHtml;

    const primaryLabelEl = document.querySelector("[data-metric-label='primary']");
    if (primaryLabelEl) primaryLabelEl.textContent = config.primaryMetric.label;
    const secondaryLabelEl = document.querySelector("[data-metric-label='secondary']");
    const secondaryMetricCard = document.querySelector("[data-metric-card='secondary']");
    if (secondaryMetricCard) secondaryMetricCard.hidden = !config.secondaryMetric;
    if (secondaryLabelEl && config.secondaryMetric) secondaryLabelEl.textContent = config.secondaryMetric.label;

    const primaryBtn = document.querySelector("[data-demo-primary-action]");
    if (primaryBtn && primaryBtn.dataset.sending !== "true") primaryBtn.textContent = config.primaryAction.label;
    const secondaryBtn = document.querySelector("[data-demo-secondary-action]");
    if (secondaryBtn) {
      secondaryBtn.hidden = !config.secondaryAction;
      if (config.secondaryAction && secondaryBtn.dataset.sending !== "true") {
        secondaryBtn.textContent = config.secondaryAction.label;
      }
    }

    const previewCard = document.querySelector("[data-demo-card='preview']");
    if (previewCard) previewCard.hidden = !config.showBoardPreview || !atDefault;

    const wantSecondaryMetric =
      config.secondaryMetric && atDefault && (!config.secondaryMetric.requiresAccount || !!accountId);

    const [primaryResult, secondaryResult, boardResult] = await Promise.allSettled([
      atDefault ? config.primaryMetric.fetch() : Promise.resolve(null),
      wantSecondaryMetric ? config.secondaryMetric.fetch(accountId) : Promise.resolve(null),
      config.showBoardPreview ? fetchBerryFastPreviewRegion() : Promise.resolve(null),
    ]);

    const primaryValueEl = document.getElementById("total-supply");
    if (primaryValueEl) {
      if (!atDefault) {
        primaryValueEl.textContent = "—";
      } else if (primaryResult.status === "fulfilled") {
        primaryValueEl.textContent = config.primaryMetric.format(primaryResult.value);
      } else {
        primaryValueEl.textContent = "—";
        console.error(`Failed to fetch ${config.primaryMetric.label.toLowerCase()}:`, primaryResult.reason);
      }
    }

    const secondaryValueEl = document.getElementById("your-balance");
    if (secondaryValueEl) {
      if (!config.secondaryMetric) {
        secondaryValueEl.textContent = "—";
      } else if (!atDefault) {
        secondaryValueEl.textContent = "—";
      } else if (secondaryResult.status === "fulfilled") {
        secondaryValueEl.textContent = config.secondaryMetric.format(secondaryResult.value);
      } else {
        secondaryValueEl.textContent = "—";
        console.error(`Failed to fetch ${config.secondaryMetric.label.toLowerCase()}:`, secondaryResult.reason);
      }
    }

    if (config.showBoardPreview) {
      const board = document.getElementById("near-el-board");
      const boardNote = document.getElementById("near-el-board-note");
      if (board instanceof HTMLCanvasElement) {
        if (boardResult.status === "fulfilled" && boardResult.value) {
          renderBerryFastBoardPreview(board, boardResult.value.image);
          if (boardNote) {
            boardNote.innerHTML = `Live crop from <a class="text-link external-link-indicator" href="https://berry.fast" rel="noopener noreferrer" target="_blank">berry.fast</a> region <code>${berryFastPreviewRegion.rx},${berryFastPreviewRegion.ry}</code>, tightened around the three-face cluster.`;
          }
        } else {
          if (boardResult.status === "rejected") {
            console.error("Failed to fetch berry.fast board preview:", boardResult.reason);
          }
          const context = board.getContext("2d");
          if (context) {
            context.clearRect(0, 0, board.width, board.height);
            context.fillStyle = "#000";
            context.fillRect(0, 0, board.width, board.height);
          }
          if (boardNote) {
            boardNote.textContent = "Could not load the live berry.fast board preview.";
          }
        }
      }
    }

    const demoNoteBanner = document.getElementById("demo-actions-note");
    [primaryBtn, secondaryBtn].forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.dataset.sending === "true") return;
      btn.disabled = !atDefault;
      btn.setAttribute("aria-disabled", String(!atDefault));
    });
    if (demoNoteBanner) {
      demoNoteBanner.innerHTML = config.disabledNoteHtml();
      demoNoteBanner.hidden = atDefault;
    }
  }

  function setBtnSending(btn, sending) {
    if (sending) {
      btn._savedHTML = btn.innerHTML;
      btn.dataset.sending = "true";
      btn.disabled = true;
      btn.innerHTML = 'Sending…<span class="btn-hint">check the dev console for results</span>';
    } else {
      delete btn.dataset.sending;
      btn.disabled = false;
      btn.innerHTML = btn._savedHTML;
    }
  }

  async function sendDemoTx(actionSpec, btn) {
    if (!nearWallet.isConnected({ network: currentNetwork })) {
      console.warn("Not signed in");
      return;
    }
    if (!isDefaultContract()) {
      console.warn(`${actionSpec.methodName} is ${defaultContractFor(currentNetwork)}-only; current contract is ${currentContractId}`);
      return;
    }
    setBtnSending(btn, true);
    try {
      const deposit = actionSpec.deposit === "0" ? "0" : cu(actionSpec.deposit);
      // Per-network signing through the api layer: near.recipes.functionCall
      // reads the signer from near.state's testnet/mainnet slot (populated by
      // the onConnect bridge above), threads `network` to the wallet provider,
      // and the wallet picks the right session to dispatch through. One
      // call replaces the connector-format nearWallet.sendTransaction.
      const result = await near.recipes.functionCall({
        network: currentNetwork,
        receiverId: actionSpec.contractId ?? currentContractId,
        methodName: actionSpec.methodName,
        args: actionSpec.buildArgs(),
        gas: cu(actionSpec.gas),
        deposit,
      });
      console.log(`${actionSpec.methodName} result:`, result);
      updateUI();
      if (actionSpec.contractId === BerryFastDrawContract && demoConfig().showBoardPreview) {
        pollBoardUntilUpdated();
      }
    } catch (err) {
      if (/reject|cancel/i.test(err.message)) {
        console.log(`${actionSpec.methodName} cancelled by user`);
      } else {
        console.error(`Failed to ${actionSpec.methodName}:`, err);
      }
    } finally {
      setBtnSending(btn, false);
    }
  }

  function setupEventHandlers() {
    const primaryBtn = document.querySelector("[data-demo-primary-action]");
    primaryBtn?.addEventListener("click", () => {
      const action = demoConfig().primaryAction;
      if (action) sendDemoTx(action, primaryBtn);
    });

    const secondaryBtn = document.querySelector("[data-demo-secondary-action]");
    secondaryBtn?.addEventListener("click", () => {
      const action = demoConfig().secondaryAction;
      if (action) sendDemoTx(action, secondaryBtn);
    });
  }

  nearWallet.onConnect((result) => {
    console.log("Wallet connected:", result.accountId);
    // Bridge the wallet's per-network connect into the api's per-network
    // state map. The IIFE auto-wires `near.useWallet(window.nearWallet)`
    // on load so the api can dispatch through the wallet provider, but it
    // does not mirror the wallet's per-network accountId — without this
    // bridge `near.sendTx({ network })` and `near.recipes.functionCall({ network })`
    // would throw "Must sign in" even with an active wallet session.
    if (result?.accountId) {
      near.state.updateAccountState({ accountId: result.accountId }, result.network);
      if (result.network) near.state.setActiveNetwork(result.network);
    }
    if (!scopedContractId) {
      setScopedContractId(currentContractId);
    }
    updateUI();
  });

  nearWallet.onDisconnect((info) => {
    console.log("Wallet disconnected");
    // Mirror the disconnect onto the api's per-network slot so subsequent
    // recipe calls don't see a stale account on a network the user just
    // signed out of. A parallel session on the other network is unaffected.
    if (info?.network) {
      near.state.updateAccountState(
        {
          accountId: null,
          privateKey: null,
          accessKeyContractId: null,
          lastWalletId: null,
        },
        info.network,
      );
    }
    setScopedContractId(null);
    updateUI();
  });

  near.event.onAccount((accountId) => {
    if (accountId) {
      console.log("fastnear: account update:", accountId);
    }
    updateUI();
  });

  renderNetworkSlots();
  renderContractSlots();
  onContractChange(() => {
    syncContractInputs(currentContractId);
    rerenderRecipesForContract();
    updateUI();
  });

  setupEventHandlers();
  updateUI();
}
