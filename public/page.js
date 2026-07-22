// Shared chrome for the static topic pages (x402.html, post-quantum.html,
// retries.html). Keeps the theme toggle and code-card buttons working without
// loading the demo-app module (index.js). The theme storage contract (the
// "theme" localStorage key + the root "dark" class) matches index.js exactly,
// so the choice persists across the landing page and every topic page.

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

function setupCodeCardButtons() {
  document.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".code-copy-button");
    if (copyBtn) {
      const targetSel = copyBtn.getAttribute("data-clipboard-target");
      const text = document.querySelector(targetSel)?.textContent ?? "";
      const showCopied = () => {
        copyBtn.classList.add("is-copied");
        copyBtn.setAttribute("aria-label", "Copied");
        window.setTimeout(() => {
          copyBtn.classList.remove("is-copied");
          copyBtn.setAttribute("aria-label", "Copy code to clipboard");
        }, 1100);
      };
      navigator.clipboard.writeText(text).then(showCopied).catch(() => {
        // Clipboard API can reject (permissions, unfocused document) —
        // fall back to a selection-based copy so the button still works.
        const scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        let copied = false;
        try { copied = document.execCommand("copy"); } catch {}
        scratch.remove();
        if (copied) showCopied();
      });
      return;
    }

    const wrapBtn = event.target.closest(".code-wrap-button");
    if (wrapBtn) {
      const pre = wrapBtn.closest(".code-block")?.querySelector(".code-card-body");
      if (pre) {
        pre.classList.toggle("is-wrapped");
        const pressed = pre.classList.contains("is-wrapped");
        wrapBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
        refreshCodeWrapButtons();
      }
    }
  });

  let wrapResizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(wrapResizeTimer);
    wrapResizeTimer = window.setTimeout(refreshCodeWrapButtons, 150);
  });
}

export function wireUpTopicPage() {
  const run = () => {
    setupThemeToggle();
    setupCodeCardButtons();
    refreshCodeWrapButtons();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}
