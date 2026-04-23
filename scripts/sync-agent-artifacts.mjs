import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const monorepoRoot = path.resolve(repoRoot, "../fastnear-js-monorepo");
const checkOnly = process.argv.includes("--check");

const syncPairs = [
  {
    from: path.join(monorepoRoot, "recipes/index.json"),
    to: path.join(repoRoot, "public/generated/recipes/index.json"),
  },
  {
    from: path.join(monorepoRoot, "recipes/index.json"),
    to: path.join(repoRoot, "public/recipes.json"),
  },
  {
    from: path.join(monorepoRoot, "recipes/near-node.mjs"),
    to: path.join(repoRoot, "public/near-node.mjs"),
  },
  {
    from: path.join(monorepoRoot, "recipes/near-node.mjs"),
    to: path.join(repoRoot, "public/agents.js"),
  },
  {
    from: path.join(monorepoRoot, "llms.txt"),
    to: path.join(repoRoot, "public/llms.txt"),
  },
  {
    from: path.join(monorepoRoot, "llms-full.txt"),
    to: path.join(repoRoot, "public/llms-full.txt"),
  },
];

let hasDiff = false;

const recipeIndexPath = path.join(monorepoRoot, "recipes/index.json");
const hostedReadmePath = path.join(repoRoot, "README.md");

function replaceBetweenMarkers(source, markerId, replacement) {
  const startMarker = `<!-- BEGIN GENERATED:${markerId} -->`;
  const endMarker = `<!-- END GENERATED:${markerId} -->`;

  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing markers for ${markerId}`);
  }

  return `${source.slice(0, startIndex + startMarker.length)}\n${replacement}\n${source.slice(endIndex)}`;
}

function findRecipe(recipeIndex, id) {
  const recipe = recipeIndex.recipes.find((entry) => entry.id === id);
  if (!recipe) {
    throw new Error(`Missing recipe ${id}`);
  }
  return recipe;
}

function findSnippet(recipe, snippetId) {
  const snippet = recipe.snippets.find((entry) => entry.id === snippetId);
  if (!snippet) {
    throw new Error(`Missing snippet ${snippetId} for recipe ${recipe.id}`);
  }
  return snippet;
}

function renderQuestionSection(recipeIndex) {
  const sections = [
    ["view-contract", "browser-global"],
    ["view-account", "browser-global"],
    ["inspect-transaction", "browser-global"],
    ["function-call", "browser-global"],
  ];

  return sections.map(([recipeId, snippetId]) => {
    const recipe = findRecipe(recipeIndex, recipeId);
    const snippet = findSnippet(recipe, snippetId);

    return `### ${recipe.title}

Use \`${recipe.api}()\` when ${recipe.chooseWhen[0].replace(/^Choose this when /i, "").replace(/\.$/, "")}.

\`\`\`${snippet.language}
${snippet.code}
\`\`\`

Output keys: ${recipe.outputKeys.map((key) => `\`${key}\``).join(", ")}

Returns: \`${recipe.returns}\``;
  }).join("\n\n");
}

function renderTerminalSection(recipeIndex) {
  const { support } = recipeIndex;
  const viewRecipe = findRecipe(recipeIndex, "view-contract");
  const terminalSnippet = findSnippet(viewRecipe, "terminal");
  const curlSnippet = findSnippet(viewRecipe, "curl-jq");

  return `There are two useful terminal shapes for the same question:

- use the hosted JS wrapper when you want the agent-first JS surface and normal object access
- use \`curl + jq\` when you want the raw transport shape for shell scripting

The canonical hosted recipe catalog is [${support.hostedCatalogLabel}](${support.hostedCatalogUrl}), and the hosted terminal wrapper is [agents.js](${support.hostedAgentEntry}).

Discovery order for agents:

${support.discoveryOrder.map((entry) => `${entry.step}. ${entry.label} — ${entry.detail}`).join("\n")}

Set \`${support.apiKeyEnvVar}\` before running the authenticated examples. Free trial credits are available at [${support.trialCreditsLabel}](${support.trialCreditsUrl}).

### Agent-first JS wrapper

\`\`\`${terminalSnippet.language}
${terminalSnippet.code}
\`\`\`

### Same question with curl + jq

\`\`\`${curlSnippet.language}
${curlSnippet.code}
\`\`\`

### ${support.captureExample.title}

${support.captureExample.summary}

\`\`\`${support.captureExample.language}
${support.captureExample.code}
\`\`\`

### Choose the surface quickly

${recipeIndex.families.map((family) => `- \`${family.id}\`: ${family.summary}`).join("\n")}

Browser-only tasks such as wallet connect, function calls, transfers, and message signing stay on the browser-global or ESM snippets from the generated catalog.`;
}

for (const pair of syncPairs) {
  const nextContent = readFileSync(pair.from, "utf8");
  let currentContent = null;

  try {
    currentContent = readFileSync(pair.to, "utf8");
  } catch {
    currentContent = null;
  }

  if (currentContent !== nextContent) {
    hasDiff = true;
    if (!checkOnly) {
      mkdirSync(path.dirname(pair.to), { recursive: true });
      writeFileSync(pair.to, nextContent);
    }
  }
}

const recipeIndex = JSON.parse(readFileSync(recipeIndexPath, "utf8"));
const currentReadme = readFileSync(hostedReadmePath, "utf8");
let nextReadme = replaceBetweenMarkers(
  currentReadme,
  "start-with-question",
  renderQuestionSection(recipeIndex)
);
nextReadme = replaceBetweenMarkers(
  nextReadme,
  "terminal-first",
  renderTerminalSection(recipeIndex)
);

if (currentReadme !== nextReadme) {
  hasDiff = true;
  if (!checkOnly) {
    writeFileSync(hostedReadmePath, nextReadme);
  }
}

if (checkOnly && hasDiff) {
  console.error("Hosted agent artifacts are out of sync. Run: node scripts/sync-agent-artifacts.mjs");
  process.exit(1);
}
