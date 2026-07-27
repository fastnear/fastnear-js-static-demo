const merchantRequests = Object.freeze({
  near: {
    url: "https://merchant-near.mikedotexe.com/v1/evidence/account",
    body: { accountId: "mike.near" },
  },
  base: {
    url: "https://merchant-base.mikedotexe.com/v1/evidence/account",
    body: { address: "0xcA202E03f11Aa076c57EAE666Da3f933dCc71CC9" },
  },
});

function decodeBase64Json(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function formatAtomicUsdc(amount) {
  if (!/^\d+$/.test(amount)) {
    return `${amount} atomic USDC`;
  }

  const padded = amount.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).replace(/0+$/, "");
  const decimal = fraction ? `${whole}.${fraction}` : whole;
  return `$${decimal} USDC (${BigInt(amount).toLocaleString("en-US")} atomic)`;
}

function summarizeBazaar(challenge) {
  const bazaar = challenge.extensions?.bazaar;
  const input = bazaar?.info?.input;
  const output = bazaar?.info?.output;
  const inputSchema = bazaar?.schema?.properties?.input;
  const outputSchema = bazaar?.schema?.properties?.output;

  if (
    input?.method === "POST"
    && input?.bodyType === "json"
    && inputSchema
    && output
    && outputSchema
  ) {
    return "POST JSON · input + output metadata";
  }

  return "Metadata incomplete";
}

export function parsePaymentRequired(encoded, httpStatus) {
  const challenge = decodeBase64Json(encoded);
  const accepted = challenge.accepts?.[0];

  if (httpStatus !== 402 || challenge.x402Version !== 2 || !accepted) {
    throw new Error("The merchant did not return a canonical x402 v2 challenge.");
  }

  for (const field of ["network", "scheme", "amount", "asset", "payTo"]) {
    if (typeof accepted[field] !== "string" || !accepted[field]) {
      throw new Error(`The live challenge is missing ${field}.`);
    }
  }

  return {
    httpStatus: `${httpStatus} Payment Required`,
    version: `x402 v${challenge.x402Version}`,
    network: accepted.network,
    scheme: accepted.scheme,
    price: formatAtomicUsdc(accepted.amount),
    asset: accepted.asset,
    payTo: accepted.payTo,
    bazaar: summarizeBazaar(challenge),
  };
}

async function inspectMerchant(chain) {
  const request = merchantRequests[chain];
  if (!request) {
    throw new Error("Unknown merchant network.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
    if (!paymentRequired) {
      throw new Error(`The merchant returned HTTP ${response.status} without a payment challenge.`);
    }
    return parsePaymentRequired(paymentRequired, response.status);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The merchant did not respond within 12 seconds.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderChallenge(card, result) {
  for (const [field, value] of Object.entries(result)) {
    const output = card.querySelector(`[data-field="${field}"]`);
    if (output) {
      output.textContent = value;
      output.title = value;
    }
  }
  card.querySelector("[data-inspector-output]").hidden = false;
}

function setupInspectors() {
  document.querySelectorAll("[data-inspect-chain]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-inspector]");
      const status = card?.querySelector("[data-inspector-status]");
      if (!card || !status) return;

      button.disabled = true;
      card.dataset.state = "loading";
      status.textContent = "Requesting the live unpaid challenge…";

      try {
        const result = await inspectMerchant(button.dataset.inspectChain);
        renderChallenge(card, result);
        card.dataset.state = "success";
        status.textContent = "Live challenge decoded. No payment was sent.";
        button.textContent = "Refresh live challenge";
      } catch (error) {
        card.dataset.state = "error";
        status.textContent = error instanceof Error ? error.message : "The live challenge could not be decoded.";
      } finally {
        button.disabled = false;
      }
    });
  });
}

export function wireUpX402Page() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupInspectors);
  } else {
    setupInspectors();
  }
}
