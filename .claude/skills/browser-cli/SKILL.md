---
description: Drive the maxtellar web app in headless Chromium for real browser verification (screenshots, console errors, click/fill/nav). Use this instead of a one-off Playwright script whenever the task calls for actually running the app in a browser (matches run/verify skill needs). Not for unit/integration tests — use test-timekeeper for those.
---

# browser-cli

A local, token-cheap replacement for the (unavailable in this sandbox)
`chromium-cli` tool referenced by the built-in `run` skill. Wraps
Playwright with a small stdin command language, so driving the app
doesn't require writing a fresh Node script each time.

Lives at `.claude/tools/browser-cli/` (survives `/delete-code` — it's
under `.claude/`, not app code).

## Token discipline: screenshots are rationed, not banned (2026-07-13)

Reading a full-page PNG costs ~1.1–1.5k tokens; an `eval` probe costs ~50.
Screenshots taken but never Read cost nothing — the discipline is in reading.

1. **Assert with `eval` first**: element presence, classes, text, counts —
   e.g. `eval JSON.stringify({locks: document.querySelectorAll('.lock-icon').length})`.
2. **Read at most ONE decisive screenshot per flow**, and only when (a) an
   eval result contradicts expectations, or (b) the change is visual by
   nature (layout, hue, typography) and only eyes can pass it.
3. **Prefer `screenshot-element`** (crop to `.card`, `.history-row`, …) over
   full-page — fewer image tokens, higher effective resolution on the target.
4. **Pure-logic changes get zero screenshots** — unit tests + eval probes
   carry reducer/settle math; screenshots enter only when a view changed.

Never ban screenshots outright: eval only checks what you thought to ask.
A real case (2026-07-13): the probe said `{"bAlive":true}` — pass — while
the screenshot showed the task had been created as FIXED instead of
semi-tail, invalidating the whole flow.

## Prerequisites

- Dev server running first (see `run-timekeeper` skill —
  `cd apps/web && npm run dev`).
- First invocation auto-installs a local `libasound.so.2` (via
  unprivileged `apt-get download`, no sudo) because this sandbox's
  headless Chromium needs it and there's no root. This is cached in
  `.claude/tools/browser-cli/.libasound-extract/` after the first run.

## Usage

Pipe a command script to `run.sh`:

```bash
BROWSER_CLI_SESSION=mysession bash .claude/tools/browser-cli/run.sh <<'EOF'
nav http://localhost:5173
wait-for text=maxtellar
screenshot
click text=+
fill input Title text here
wait 1500
screenshot
console --errors
quit
EOF
```

Screenshots land in
`.claude/tools/browser-cli/sessions/<session>/screenshots/NN.png`
(read the numbered ones with the Read tool — don't guess, check what
was written).

## Commands

- `nav <url>` — navigate, waits for DOM content loaded
- `wait-for text=<substr>` or `wait-for <css-selector>` — wait up to 15s
- `click <css-selector>` / `click-text <substr>`
- `fill <css-selector> <value>` — value is everything after the first space;
  breaks on selectors containing a space (e.g. `[placeholder="e.g. Foo"]`) —
  use `fill-nth` for those
- `fill-nth <css-selector> <index> <value>` — e.g. `fill-nth input 1 meal prep`
  fills the 2nd matching element; sidesteps `fill`'s selector-with-space bug
- `press <key>` — e.g. `Enter`, `Escape`
- `drag <css-selector> <dx> <dy> [bottom|top]` — real mousedown → 10 stepped
  mousemoves → mouseup. The steps matter: drag-tracking libraries (RBC's dnd
  addon) ignore a single teleporting move. The 4th arg grabs that **edge**
  instead of the centre — that's how you hit a resize handle rather than the
  block body. Selector must not contain spaces or `>>` (same parsing limit as
  `fill`). E.g. `drag .rbc-event 0 90 bottom` = drag the bottom edge down 90px.
- `wait <ms>` — plain timeout, use for debounce windows / model loads
- `viewport <w> <h>` — resize the viewport (e.g. `viewport 390 844` for
  phone-width media queries); issue it BEFORE `nav`
- `screenshot` — full page, auto-numbered
- `screenshot-element <css-selector>` — crop to one element
- `console` / `console --errors` — dump captured console/pageerror/failed-request logs
- `eval <js-expression>` — `page.evaluate`, returns JSON
- `quit` — closes the browser, ends the script

## Gotchas that cost real time (2026-07-17)

- **`fill` doesn't always reach React.** Playwright's fill sets the DOM value;
  React's `onChange` may never fire, so the app's state stays empty and a save
  silently fails validation. When a field looks filled but the app disagrees,
  set it through React's own setter:
  ```js
  eval (()=>{const set=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};set(document.querySelector('input[aria-label="Title"]'),'Gym');return 'ok'})()
  ```
- **Read the app's OWN error before re-trying a save.** `.drawer .form-warning`
  told me "Pick a sub-head." after several blind attempts.
- **A fresh app has almost no sub-heads.** `DEFAULT_REGISTRY` (heads.tsx) seeds
  only the built-ins — **Sleep / Nap / Food** are the only valid plannable
  sub-heads until you add more. `SubheadField` is a `FuzzyDropdown` over
  `plannableActivities`: free text is rejected, so a template fixture must use
  one of those three (or add an activity first).
- **`click-text` matches text behind overlays.** It happily "found" a
  `.field-desc` under the drawer and timed out on the interception. Prefer a
  CSS selector (`.drawer-footer button.primary`).

## Why this exists

`chromium-cli` doesn't exist as an installable package and isn't
present in this sandbox. This wrapper reproduces the same command
shape (`nav` / `wait-for` / `screenshot` / `console --errors`) so
future browser verification here follows one low-token pattern instead
of a fresh ad-hoc script (and its multi-KB network/console dumps) each
time. If a real Chromium sandbox with `chromium-cli` ever becomes
available, prefer that instead.
