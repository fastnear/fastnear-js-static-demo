/** @type { import("@fastnear/api") } */
/* global near, nearWallet */
/* ^ UMD globals loaded via <script> tags in index.html */

const contractId = "berryclub.ek.near";
const defaultNetwork = "mainnet";
const BoardHeight = 50;
const DefaultBalance = "0.0000 🥑";
const berryFastApiBase = "https://api.berry.fastnear.com";
const berryFastRegionSize = 128;
const berryFastPixelStride = 6;
const berryFastPreviewRegion = { rx: -1, ry: 0 };
const berryFastPreviewCrop = { x: 2, y: 0, width: 124, height: 46 };
const berryFastPreviewScale = 8;
const walletManifest = "./manifest.json";
const walletConnect = { projectId: "4b2c7201ce4c03e0fb59895a2c251110" };
const walletOptions = {
  network: defaultNetwork,
  contractId,
  manifest: walletManifest,
  walletConnect,
};

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
    description: "Canonical JSON-RPC methods and request shapes for direct chain reads and writes.",
    url: `${DOCS_BASE}/rpc`,
  },
  {
    title: "API",
    description: "FastNear REST APIs for account ownership, holdings, and public-key discovery.",
    url: `${DOCS_BASE}/api`,
  },
  {
    title: "Transactions",
    description: "Indexed transaction, receipt, and block-level execution history.",
    url: `${DOCS_BASE}/tx`,
  },
  {
    title: "Transfers",
    description: "Transfer-specific feeds when the question is about asset movement.",
    url: `${DOCS_BASE}/transfers`,
  },
  {
    title: "NEAR Data",
    description: "Recent block, shard, and chunk documents without stitching chain data yourself.",
    url: `${DOCS_BASE}/neardata`,
  },
  {
    title: "FastData KV",
    description: "Indexed contract storage and exact-key history for storage-heavy investigations.",
    url: `${DOCS_BASE}/fastdata/kv`,
  },
  {
    title: "Agents",
    description: "Agent guidance, authentication posture, and API-family routing across FastNear docs.",
    url: `${DOCS_BASE}/agents`,
  },
  {
    title: "Auth & Access",
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

export function normalizeHostedCatalogForPage(generated, assetUrls = getHostedAssetUrls()) {
  return {
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
        <button class="copy-button" data-clipboard-target="#${codeId}">Copy</button>
      </div>
      <pre class="code-card-body"><code id="${codeId}">${escapeHtml(snippet.code)}</code></pre>
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

function buildFamilyCard(family) {
  const docs = getServiceMeta(family.id);
  const authStyle = family.authStyle === "query" ? "Query auth" : family.authStyle === "bearer" ? "Bearer auth" : family.authStyle;

  return `
    <article class="card surface-card">
      <div class="surface-head">
        <div>
          <div class="card-kicker">${escapeHtml(family.id)}</div>
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
  return `
    <a class="card docs-card" href="${escapeHtml(entry.url)}" rel="noopener noreferrer" target="_blank">
      <div class="card-kicker">docs.fastnear.com</div>
      <h3 class="card-title">${escapeHtml(entry.title)}</h3>
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
        <button class="copy-button" data-clipboard-target="#${codeId}">Copy</button>
      </div>
      <pre class="code-card-body"><code id="${codeId}">${escapeHtml(snippet.code)}</code></pre>
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
            <span class="badge-pill badge-pill-strong">${escapeHtml(serviceMeta.title)}</span>
            <span class="badge-pill badge-pill-strong">${escapeHtml(authLabel(recipe.auth))}</span>
          </div>
          <a class="button-secondary button-small" href="${escapeHtml(serviceMeta.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(serviceMeta.cta)}</a>
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

    const generated = normalizeHostedCatalogForPage(await response.json(), assetUrls);
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
  const defaultConfig = { networkId: defaultNetwork };
  const updatedConfig = { ...defaultConfig, ...configOpts };
  near.config(updatedConfig);

  restoreReady = nearWallet.restore(walletOptions)
    .then((result) => {
      if (result) {
        console.log("Restored wallet session:", result.accountId);
      }
    })
    .catch((err) => {
      console.warn("Wallet restore failed:", err);
    });
}

export function wireUpAppLate() {
  const cu = near.utils.convertUnit;
  setupThemeToggle();
  setupScrollHeader();

  function closeAuthMenus() {
    document.querySelectorAll("[data-auth-container].open").forEach((container) => {
      container.classList.remove("open");
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
        closeAuthMenus();
        await nearWallet.disconnect();
        location.reload();
        return;
      }

      const signInButton = event.target.closest("[data-auth-signin]");
      if (signInButton) {
        event.preventDefault();
        event.stopPropagation();
        await nearWallet.connect(walletOptions);
        return;
      }

      const recipeConnectButton = event.target.closest("[data-recipe-connect]");
      if (recipeConnectButton) {
        event.preventDefault();
        event.stopPropagation();
        await nearWallet.connect(walletOptions);
        return;
      }

      const authToggle = event.target.closest("[data-auth-toggle]");
      if (authToggle) {
        event.preventDefault();
        event.stopPropagation();
        const container = authToggle.closest("[data-auth-container]");
        const isOpen = container?.classList.contains("open");
        closeAuthMenus();
        if (container && !isOpen) {
          container.classList.add("open");
        }
        return;
      }

      if (!event.target.closest("[data-auth-container]")) {
        closeAuthMenus();
      }
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

  async function updateUI() {
    const authSlots = document.querySelectorAll("[data-auth-slot]");

    await restoreReady;

    if (!authSlots.length) {
      return;
    }

    closeAuthMenus();

    if (nearWallet.isConnected()) {
      authSlots.forEach((authSlot) => {
        authSlot.innerHTML = `
        <button class="auth-pill" data-auth-toggle="true" type="button">
          <span class="auth-account-name">${nearWallet.accountId()}</span>
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

    const totalSupplyElement = document.getElementById("total-supply");
    const yourBalanceElement = document.getElementById("your-balance");
    const board = document.getElementById("near-el-board");
    const boardNote = document.getElementById("near-el-board-note");

    const [supplyResult, accountResult, boardResult] = await Promise.allSettled([
      near.view({ contractId, methodName: "ft_total_supply", args: {} }),
      nearWallet.accountId()
        ? near.view({ contractId, methodName: "get_account", args: { account_id: nearWallet.accountId() } })
        : Promise.resolve(null),
      fetchBerryFastPreviewRegion(),
    ]);

    if (totalSupplyElement) {
      if (supplyResult.status === "fulfilled" && supplyResult.value) {
        totalSupplyElement.textContent = `${(parseFloat(supplyResult.value) / 1e18).toFixed(4)} 🥑`;
      } else {
        totalSupplyElement.textContent = "-";
        if (supplyResult.status === "rejected") {
          console.error("Failed to fetch total supply:", supplyResult.reason);
        }
      }
    }

    if (yourBalanceElement) {
      const berryAccount = accountResult.status === "fulfilled" ? accountResult.value : null;
      if (accountResult.status === "rejected") {
        console.error("Failed to fetch account:", accountResult.reason);
      }
      yourBalanceElement.textContent =
        berryAccount && !isNaN(berryAccount.avocado_balance)
          ? `${(parseFloat(berryAccount.avocado_balance) / 1e18).toFixed(4)} 🥑`
          : DefaultBalance;
    }

    if (board instanceof HTMLCanvasElement) {
      if (boardResult.status === "fulfilled") {
        renderBerryFastBoardPreview(board, boardResult.value.image);
        if (boardNote) {
          boardNote.innerHTML = `Live crop from <a class="text-link external-link-indicator" href="https://berry.fast" rel="noopener noreferrer" target="_blank">berry.fast</a> region <code>${berryFastPreviewRegion.rx},${berryFastPreviewRegion.ry}</code>, tightened around the three-face cluster.`;
        }
      } else {
        console.error("Failed to fetch berry.fast board preview:", boardResult.reason);
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

  function setBtnSending(btn, sending) {
    if (sending) {
      btn._savedHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Sending…<span class="btn-hint">check the dev console for results</span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._savedHTML;
    }
  }

  function setupEventHandlers() {
    const buyBtn = document.getElementById("buy-tokens");
    buyBtn?.addEventListener("click", async () => {
      if (!nearWallet.isConnected()) {
        console.warn("Not signed in");
        return;
      }
      setBtnSending(buyBtn, true);
      try {
        const result = await nearWallet.sendTransaction({
          signerId: nearWallet.accountId(),
          receiverId: contractId,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: "buy_tokens",
                gas: cu("100 Tgas"),
                deposit: cu("0.01 NEAR"),
                args: {},
              },
            },
          ],
        });
        console.log("buy_tokens result:", result);
        updateUI();
      } catch (err) {
        if (/reject|cancel/i.test(err.message)) {
          console.log("buy_tokens cancelled by user");
        } else {
          console.error("Failed to buy tokens:", err);
        }
      } finally {
        setBtnSending(buyBtn, false);
      }
    });

    const drawBtn = document.getElementById("draw-pixel");
    drawBtn?.addEventListener("click", async () => {
      if (!nearWallet.isConnected()) {
        console.warn("Not signed in");
        return;
      }
      setBtnSending(drawBtn, true);
      try {
        const randVal = Math.floor(Math.random() * BoardHeight * BoardHeight);
        const result = await nearWallet.sendTransaction({
          signerId: nearWallet.accountId(),
          receiverId: contractId,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: "draw",
                gas: cu("100 Tgas"),
                deposit: "0",
                args: {
                  pixels: [
                    {
                      x: randVal % BoardHeight,
                      y: Math.floor(randVal / BoardHeight) % BoardHeight,
                      color: 65280,
                    },
                  ],
                },
              },
            },
          ],
        });
        console.log("draw result:", result);
        updateUI();
      } catch (err) {
        if (/reject|cancel/i.test(err.message)) {
          console.log("draw cancelled by user");
        } else {
          console.error("Failed to draw pixel:", err);
        }
      } finally {
        setBtnSending(drawBtn, false);
      }
    });
  }

  nearWallet.onConnect((result) => {
    console.log("Wallet connected:", result.accountId);
    updateUI();
  });

  nearWallet.onDisconnect(() => {
    console.log("Wallet disconnected");
    updateUI();
  });

  near.event.onAccount((accountId) => {
    if (accountId) {
      console.log("fastnear: account update:", accountId);
    }
    updateUI();
  });

  setupEventHandlers();
  updateUI();
}
