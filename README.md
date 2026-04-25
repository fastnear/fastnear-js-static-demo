# Berry Club: Task-First FastNear JS Examples

This repo hosts a working [Berry Club](https://berryclub.io) demo on NEAR, built with [`@fastnear/api`](https://www.npmjs.com/package/@fastnear/api) and [`@fastnear/wallet`](https://www.npmjs.com/package/@fastnear/wallet).

Start with the question, then pick the smallest recipe that answers it.

## Start With the Question

<!-- BEGIN GENERATED:start-with-question -->
### What does this contract method return?

Use `near.recipes.viewContract()` when you already know the exact contract method and want the smallest answer quickly.

```js
const result = await near.recipes.viewContract({
  contractId: "berryclub.ek.near",
  methodName: "get_account",
  args: { account_id: "root.near" },
});

near.print({
  account_id: result.account_id,
  avocado_balance: result.avocado_balance,
  num_pixels: result.num_pixels,
});
```

Output keys: `account_id`, `avocado_balance`, `num_pixels`

Returns: `BerryClubAccountView`

### What does this account look like on chain?

Use `near.recipes.viewAccount()` when the question is about one account's chain state rather than token holdings or transfers.

```js
const account = await near.recipes.viewAccount("root.near");

const { amount, locked, storage_usage, block_height, block_hash } = account;

near.print({
  amount,
  locked,
  storage_usage,
  block_height,
  block_hash,
});
```

Output keys: `amount`, `locked`, `storage_usage`, `block_height`, `block_hash`

Returns: `RpcViewAccountResponse`

### What happened in this transaction?

Use `near.tx.transactions()` when the only durable identifier you have is the transaction hash.

```js
const tx = await near.recipes.inspectTransaction(
  "7ZKnhzt2MqMNmsk13dV8GAjGu3Db8aHzSBHeNeu9MJCq"
);

near.print(
  tx
    ? {
        hash: tx.transaction.hash,
        signer_id: tx.transaction.signer_id,
        receiver_id: tx.transaction.receiver_id,
        included_block_height: tx.execution_outcome.block_height,
        receipt_count: tx.receipts.length,
      }
    : null
);
```

Output keys: `transactions[].transaction.hash`, `transactions[].transaction.signer_id`, `transactions[].transaction.receiver_id`, `transactions[].execution_outcome.block_height`, `transactions[].receipts`

Returns: `FastNearTxTransactionsResponse`

### How do I send one function call?

Use `near.recipes.functionCall()` when you need one contract call and already know the receiver, method, and args.

```js
const cu = near.utils.convertUnit;

const result = await near.recipes.functionCall({
  receiverId: "berryclub.ek.near",
  methodName: "draw",
  args: {
    pixels: [{ x: 10, y: 20, color: 65280 }],
  },
  gas: cu("100 Tgas"),
  deposit: "0",
});

near.print(result);
```

Output keys: `transaction`, `outcomes`, `status`

Returns: `WalletTransactionResult`
<!-- END GENERATED:start-with-question -->

## Terminal First

<!-- BEGIN GENERATED:terminal-first -->
There are two useful terminal shapes for the same question:

- use the hosted JS wrapper when you want the agent-first JS surface and normal object access
- use `curl + jq` when you want the raw transport shape for shell scripting

The canonical hosted recipe catalog is [js.fastnear.com/recipes.json](https://js.fastnear.com/recipes.json), and the hosted terminal wrapper is [agents.js](https://js.fastnear.com/agents.js).

Discovery order for agents:

1. Read llms.txt — Start with the concise repo and runtime map.
2. Fetch recipes.json — Use the hosted machine-readable recipe catalog with stable IDs, families, auth, returns, and snippets.
3. Run agents.js — Use the hosted terminal wrapper when you want the FastNear JS surface.
4. Fall back to curl + jq — Use raw transport when survey scripting or HTTP-level inspection is more useful.

Set `FASTNEAR_API_KEY` before running the authenticated examples. Free trial credits are available at [dashboard.fastnear.com](https://dashboard.fastnear.com).

### Agent-first JS wrapper

```bash
# Assumes FASTNEAR_API_KEY is already set in your shell.
node -e "$(curl -fsSL https://js.fastnear.com/agents.js)" <<'EOF'
const result = await near.recipes.viewContract({
  contractId: "berryclub.ek.near",
  methodName: "get_account",
  args: { account_id: "root.near" },
});

near.print({
  account_id: result.account_id,
  avocado_balance: result.avocado_balance,
  num_pixels: result.num_pixels,
});
EOF
```

### Same question with curl + jq

```bash
# Assumes FASTNEAR_API_KEY is already set in your shell.
ACCOUNT_ID=root.near
ARGS_BASE64="$(jq -nc --arg account_id "$ACCOUNT_ID" '{account_id: $account_id}' | base64 | tr -d '\n')"

curl -sS "https://rpc.mainnet.fastnear.com?apiKey=$FASTNEAR_API_KEY"   -H 'content-type: application/json'   --data "$(jq -nc --arg args "$ARGS_BASE64" '{
    jsonrpc:"2.0",id:"fastnear",method:"query",
    params:{
      request_type:"call_function",
      finality:"final",
      account_id:"berryclub.ek.near",
      method_name:"get_account",
      args_base64:$args
    }
  }')"   | jq '.result.result | implode | fromjson | {account_id, avocado_balance, num_pixels}'
```

### Capture and chain one result

Keep the object work in JS, then hand the emitted JSON back to shell tooling when you need one more filter step. Every `near.recipes.*`, `near.view`, `near.ft.*`, and `near.nft.*` accepts a per-call `{ network: "testnet" }` override; see the `connect-testnet` and `function-call-testnet` recipes for the end-to-end testnet flow.

```bash
# Assumes FASTNEAR_API_KEY is already set in your shell.
ACCOUNT_SUMMARY="$(node -e "$(curl -fsSL https://js.fastnear.com/agents.js)" <<'EOF'
const account = await near.recipes.viewAccount("root.near");

const { block_hash, storage_usage } = account;

near.print({ block_hash, storage_usage });
EOF
)"
BLOCK_HASH="$(printf '%s\n' "$ACCOUNT_SUMMARY" | jq -r '.block_hash')"
STORAGE_USAGE="$(printf '%s\n' "$ACCOUNT_SUMMARY" | jq -r '.storage_usage')"

printf 'block_hash=%s\nstorage_usage=%s\n' "$BLOCK_HASH" "$STORAGE_USAGE"
```

### Choose the surface quickly

- `rpc`: Canonical NEAR JSON-RPC defaults for direct contract views, account state, and transaction status checks.
- `api`: FastNear REST aggregations for account holdings, staking, and public-key oriented lookups.
- `tx`: Indexed transaction and receipt lookups for readable execution history by hash, account, or block.
- `transfers`: Asset-movement-focused history for accounts when the question is specifically about transfers, not full execution.
- `neardata`: Block and shard documents for recent chain-state inspection without reconstructing shard layouts yourself.
- `fastdata.kv`: Indexed key-value history for exact keys, predecessor scans, and account-scoped storage exploration.

Browser-only tasks such as wallet connect, function calls, transfers, and message signing stay on the browser-global or ESM snippets from the generated catalog.
<!-- END GENERATED:terminal-first -->

## Browser Bootstrap

The same recipes also work in the static browser demo. Load the UMD globals, then call `near.recipes.*` from your module:

```html
<!-- Creates window.near -->
<script src="https://js.fastnear.com/near.js"></script>
<!-- Creates window.nearWallet -->
<script src="https://js.fastnear.com/wallet.js"></script>

<script type="module">
  import { wireUpAppEarly, wireUpAppLate } from "./index.js";
  wireUpAppEarly();
  document.addEventListener("DOMContentLoaded", () => wireUpAppLate());
</script>
```

That is the entire bootstrap. `near` and `nearWallet` are available globally and in your module.

For wallet tasks, the browser demo still restores session state on load and exposes explicit connect and disconnect hooks:

```js
nearWallet.restore({ network: "mainnet", contractId, manifest: "./manifest.json" });
const result = await near.recipes.connect({
  contractId: "berryclub.ek.near",
});
console.log(result ?? near.selected());
```

## Why This Demo Exists

The repo still proves an important point: a static HTML file can do real NEAR work without a bundler, a framework, or a large install step.

| | Typical NEAR dApp | This demo |
|---|---|---|
| Dependencies | 500+ packages | 0 |
| Build step | webpack/vite/next | `python3 -m http.server` |
| Time to first task | minutes (install, configure, build) | seconds (open HTML) |
| Deploy target | Node.js hosting, Vercel, etc. | Any static file server, CDN, IPFS |
| Bundle size shipped | 200KB-2MB gzipped | two small UMD scripts from js.fastnear.com |

The difference is that this README now starts where the docs do: with the task, then the smallest recipe that answers it.

## Generated Agent Artifacts

This hosted repo now mirrors the agent-first source of truth from the sibling FastNear JS monorepo instead of hand-maintaining snippet copies.

- `public/generated/recipes/index.json` is synced from `/Users/mikepurvis/near/fastnear-js-monorepo/recipes/index.json`
- `public/recipes.json` is the hosted alias for that same machine-readable recipe catalog
- `public/agents.js` is the hosted terminal-first alias, synced from `/Users/mikepurvis/near/fastnear-js-monorepo/recipes/near-node.mjs`
- `public/near-node.mjs` stays as a backward-compatible alias to the same wrapper source
- `public/llms.txt` and `public/llms-full.txt` are synced from the monorepo root
- publishing `@fastnear/api` updates `/near.js` through the npm-backed redirect path
- deploying this hosted repo updates `public/agents.js`, `public/near-node.mjs`, `public/recipes.json`, `public/llms.txt`, and `public/llms-full.txt`

Refresh the hosted artifacts with:

```bash
cd /Users/mikepurvis/near/fastnear-js-monorepo
node scripts/generate-agent-artifacts.mjs

cd /Users/mikepurvis/near/js-example-berryclub
node scripts/sync-agent-artifacts.mjs
```

## Running

```bash
python3 -m http.server
# Open http://localhost:8000/public/index.html
```

That's it. If you want to develop against local builds of `@fastnear/api` or `@fastnear/wallet`, symlink their `dist/` directories into `public/` and update the `<script>` `src` attributes.

## Project Structure

```
public/
  index.html          # Hosted demo shell and generated recipe cards
  index.js            # Berry Club app logic and recipe renderer
  style.css           # Page layout and task-card styling
  manifest.json       # Wallet manifest (which wallets to offer)
  agents.js           # Hosted terminal wrapper alias
  near-node.mjs       # Backward-compatible alias to the same wrapper
  recipes.json        # Hosted machine-readable recipe catalog alias
  generated/          # Synced recipe catalog and LLM discovery files
  assets/             # Favicon, images
mike/                 # Archived earlier version of the demo
```

## Links

- [`@fastnear/api` on npm](https://www.npmjs.com/package/@fastnear/api)
- [`@fastnear/wallet` on npm](https://www.npmjs.com/package/@fastnear/wallet)
- [fastnear/js-monorepo on GitHub](https://github.com/fastnear/js-monorepo)
- [Berry Club](https://berryclub.io)
