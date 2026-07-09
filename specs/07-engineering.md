# PART VII — ENGINEERING

### 7.1 Termination guarantees (the anti-infinite-loop contract) — R-audit
- **Forward-only lemma:** every scheduler-caused motion of an unstarted task moves it strictly
  later; `now` strictly advances; every structural op consumes gap, consumes budget, or reduces
  segment count. Potential function strictly decreases → no infinite loop.
- **Check-before-split:** an op that would create a fragment < MIN_FRAGMENT is never performed
  (never performed-then-undone); slots < MIN_FRAGMENT are invisible to placement/wrap (R2).
- **Fixed single-tick op order (R3):** one ordered pass per tick, each task touched ≤ once:
  (1) advance `now`/running occupancy → (2) amputations → (3) top-down leading-chain resolution
  (slide/squeeze/wrap-transfer) → (4) gap merge/vanish → (5) reunification → (6) invariant
  asserts (no-overlap; Σ segment budgets = original; forward-only).
- **Atomic ceremonies (R9):** ceremony/injection steps are atomic reducer transactions; ticks
  queue behind them.
- **Bracket rebalance = one transaction, one direction (R5).**
- **Monotonic internal clock + batch catch-up (R11):** wall-clock/DST/reopen deltas are
  explicit reconciliation events, computed as one batch, not per-minute replay.
- **Global safety net:** per-tick structural-op circuit breaker (halt + snapshot on runaway,
  never silent corruption); event-sourced log → replayable bug reports.

### 7.2 Architecture & stack
- **TypeScript strict, pnpm monorepo:**
  - `packages/core` — pure scheduler: `(State, Event) → State`, integer minutes, **zero deps/
    IO**. Houses the settle-pass, tick pipeline, fork/commit, accounting identity.
  - `packages/store` — append-only **event log** + snapshots behind a `StorageAdapter`
    interface → **SQLite-wasm** (OPFS) on web (chosen over Dexie for history-scale queries,
    analytics GROUP BYs, mobile parity, Drive export); `expo-sqlite` later.
  - `apps/web` — React 18 + Vite **PWA**; Zustand; dnd-kit; absolutely-positioned timeline.
- **No backend in MVP** (local-first, solo). Cloud offload later = log segments to Drive.
- **Ticks:** minute-aligned interval + `visibilitychange` batch catch-up.
- **Testing:** Vitest + **fast-check** property tests enforcing the R-audit invariants
  (no-overlap, budget conservation, forward-only, no fragment < MIN_FRAGMENT, idempotent
  replay) + a **50k-tick random-soup simulation** harness.
- **Acceptance tests (deferred):** once UI flows stabilize, regenerate scenario-style
  (Gherkin) acceptance tests **fresh from this spec**, each scenario tagged with the rule
  it verifies (e.g. `@G7`). The old generic `features/*.feature` drafts were deleted
  2026-07-09; they described a different app and must not be resurrected. The spec stays
  the single source of truth — scenarios are a derived test layer, never a second spec.
- **Mobile later:** Expo/React Native reusing core+store untouched (health APIs → wearable).

### 7.3 Build order
0. **(done)** This spec.
1. Scaffold monorepo (pnpm workspaces, strict tsconfig, vitest, CI scripts).
2. `packages/core` — types → reducer skeleton → tick pipeline (R3 order) → settle-pass (§3.13)
   → wrap/squeeze/amputation (§3.7) → fork/commit (§3.12) → ceremonies → **property tests +
   simulation harness** (the bulk of the risk).
3. `packages/store` — event schema, snapshots, SQLite-wasm adapter, replay.
4. `apps/web` — timeline (now-seam) first, then pipeline, ceremonies, analytics/history.

### 7.4 Verification
- `pnpm test` green including fast-check suites; simulation harness: 50k ticks × 100 random
  soups, zero invariant violations, circuit breaker never trips on legal input.
- Manual: create all 5 timing types; start/pause/overrun through a fixed task; run a full SOD
  ceremony; edit-via-fork while a task runs and confirm re-settle at real `now`; verify
  timeline/pipeline sync — reproducing the spec's worked examples (§3.7 tick-by-tick numbers)
  exactly.

---
