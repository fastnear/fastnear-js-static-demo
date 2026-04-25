# Visual diff tools

Playwright-driven screenshot + computed-style measurement, used for:

- Pixel-parity regression checks when restoring / rebuilding parts of the UI
  (e.g. we used this to restore the hero's blinking-cursor animation by diffing
  against a 14-month-old commit checked out via `git worktree`).
- Spot-checking the hero across viewport widths before shipping.
- Dumping computed styles of specific elements to a JSON report for offline
  comparison.

None of this runs in production — everything lives under `scripts/visual-diff/`
and the only added runtime dependency is the `playwright` devDep in the root
`package.json`. The hosted page still loads `@fastnear/*` UMDs from CDN with
zero npm dependencies.

## One-time install

```bash
cd /Users/mikepurvis/near/js-example-berryclub
npm install
npx playwright install chromium
```

The `chromium` download is cached at `~/Library/Caches/ms-playwright/` and is
shared across projects.

## Quick start

Serve the current branch:

```bash
npm run serve        # python3 -m http.server 8000 --directory public — opens http://localhost:8000/
```

Then in a second terminal:

```bash
# Hero frames at 7 animation timestamps + computed-style JSON (dark theme)
npm run visual-diff:hero

# Full viewport screenshot (after animations settle)
npm run visual-diff:fullpage

# Hero banner at 7 viewport widths (mobile → desktop)
npm run visual-diff:responsive
```

Output lands in `scripts/visual-diff/out/` (gitignored).

## Diffing against an old commit

When you need to compare the current page against a historical version — for
example to faithfully restore an animation that drifted — check the old commit
out as a `git worktree` and serve it on a second port:

```bash
# Check out the old commit into a sibling directory. This doesn't touch the
# main working tree and the worktree is in detached-HEAD state.
git worktree add ../js-example-berryclub-archive <commit-sha>

# Serve it on 8001 (the capture scripts default to this port for "old").
cd ../js-example-berryclub-archive
python3 -m http.server 8001 &
cd -
```

Then `npm run visual-diff:hero` will capture BOTH ports automatically — the
scripts probe each URL and skip whichever is unreachable. Output filenames are
prefixed `hero-new-*` and `hero-old-*`.

When done:

```bash
git worktree remove ../js-example-berryclub-archive
kill %1  # (or pkill the python server)
```

## Scripts

### `capture.mjs` — hero at animation timestamps

- Navigates to each target URL, waits for network/fonts.
- Seeks the cursor `@keyframes` animation to each of `0, 250, 500, 1000, 1500,
  2000, 2500` ms via the Web Animations API (`element.getAnimations()` →
  `anim.currentTime = targetMs`). This is the only reliable way to catch
  mid-animation frames — Playwright's own `waitForTimeout` starts ticking
  AFTER navigation, by which time the 2-second animation has often finished.
- Screenshots the hero banner crop and dumps computed styles of the text
  element, the `::after` cursor pseudo-element, the container, and the body
  into `report-{theme}.json`.

```bash
node scripts/visual-diff/capture.mjs --theme=dark            # default
node scripts/visual-diff/capture.mjs --theme=light
node scripts/visual-diff/capture.mjs --target=new            # skip old
node scripts/visual-diff/capture.mjs --new=http://staging.example.com/...
node scripts/visual-diff/capture.mjs --viewport=1920x1080
```

### `fullpage.mjs` — top-of-page screenshots

Quick-check the hero in layout context (with the navbar above and the rest of
the page below). Waits 2.5s after load so the blink animation has finished and
the JS logo is visible in the screenshot.

```bash
node scripts/visual-diff/fullpage.mjs --theme=dark
node scripts/visual-diff/fullpage.mjs --theme=light --viewport=1280x900
```

### `responsive.mjs` — hero at multiple widths

Screenshots the hero banner + top-of-page at mobile/tablet/desktop viewport
widths (`320, 375, 414, 768, 1024, 1280, 1920` by default) with device-honest
heights. Measures `body.scrollWidth` vs `body.clientWidth` to flag horizontal
overflow. Dumps a JSON report with each width's computed `font-size` and prompt
bounding-box width.

```bash
node scripts/visual-diff/responsive.mjs --theme=dark
node scripts/visual-diff/responsive.mjs --widths=375,768,1280   # narrower sweep
```

## Reading the output

- `hero-{label}-t{ms}.png` — hero banner crop at `{ms}` into the animation,
  with the cursor animation seek-frozen so the frame is reproducible.
- `full-{label}-{theme}.png` — top-of-page screenshot (1280×900 by default)
  after animation settle.
- `responsive-{theme}-w{w}-hero.png` — just the banner at viewport width `w`.
- `responsive-{theme}-w{w}-page.png` — top of the page (width `w` × device-
  honest height).
- `report-{theme}.json` — computed styles + frame manifest. Useful when you
  need exact px values to match against an old rendering.
- `responsive-{theme}.json` — per-width font-size, prompt width, and overflow
  flag.

The scripts never delete old output; stale files from previous runs accumulate
in `out/` until you `rm -rf scripts/visual-diff/out/`.

## Adding a new check

Keep new scripts as small `.mjs` files alongside the existing ones. Conventions:

- ESM modules (match the root `package.json`'s `"type": "module"`).
- Accept `--key=value` args via the shared `Object.fromEntries(process.argv…)`
  pattern at the top of each file.
- Default `--theme` to `dark`, `--viewport` to `1280x900`.
- Use `scripts/visual-diff/out/` for all output, and include enough in the
  filename that stale runs can be spotted at a glance (theme, width, label,
  timestamp).

Then add an `npm run visual-diff:*` alias to `package.json` if the script is
meant to be a routine check.
