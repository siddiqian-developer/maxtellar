# PART VI — VIEWS

One spine, multiple projections.
1. **Active timeline (MAIN):** Google-Calendar day view; **pinned now-seam** (~35% height, day
   flows upward through it); left time axis; box heights ∝ duration; ticks every minute; strong
   seam duality; gently-witnessed reflow. Gaps = hatched empty space. Overrun = box tail past a
   budget mark.
2. **Pipeline:** Running + unstarted only; uniform cards; gaps as subtle spacing; a **control
   surface** (Start/Pause/Cancel sync to timeline unconditionally; scroll-sync only when
   co-displayed). Desktop shows timeline + pipeline side-by-side; mobile uses bottom tabs.
3. **Analytics — the 24h zero-sum ledger (from the author's 8-yr Google Sheet; core feature).**
   - **24-hour zero-sum mechanism:** every day's 24h is fully budgeted and fully accounted —
     Sleep + Waking; Waking = Work + OTW-Productive + Wasted + Lost. Nothing escapes a bucket;
     the columns must sum to 24h. This is the spiritual centre of the whole app.
   - **Real-time budgeted-vs-achieved per head:** for every head, live `Target / Achieved /
     Remaining` (per-day and weekly), updating as the day ticks — exactly the sheet's
     `Targets | Achieved | Remaining` block, but live.
   - **Weekly report:** per-head weekly target vs achieved vs remaining, plus the aggregate
     rows (Sleeping / Waking / Work / OTW-Productive / Total-Productive / Wasted / Lost Hours).
   - Time-blind on start/end times; totals only; Skipped = 0m; persistent deficit badges.
   - **Sheet mapping (reference):** sheet "heads" (Main Work, Self-Management, Health, Job,
     Core Work, Self-Learning, Kitchen Work, Sleep, Rest, Meditation, …, Time-Wasted subtree)
     → app **Heads**; sheet per-day columns → app **days (sleep-cycles)**; sheet Budgeting
     block → app **quotas** (§5.1); sheet Aggregates (Sleeping/Waking/Work/Productive/Wasted/
     Lost) → app **built-in aggregate rows**. The sheet's Wasted subtree (WhatsApp/YouTube/
     Sleepless-Bedtime/…) confirms **Wasted Time** needs user-defined sub-activities.
4. **History:** exact as-happened flow; history editor for pre-SOD edits (no-overlap enforced;
   end ≤ now wall). Cloud-offload provision (e.g. Drive) for unbounded growth.

**Task entry:** FAB → four-field drawer (Title / Start / End / Budget + head), live type-morph
chip, inline physics-snapping, `[Start now ⚡]`. Title accepts deterministic shorthand tokens
("1h30", "@18:00", "15:50-16:20", "#head") parsed by a plain grammar. **No AI/LLM anywhere —
100% local & offline.**

**Time formats:**
- Timeline/history → absolute times; pipeline cards → durations (absolute only on anchored
  edges); analytics → durations. 24h default; 12h setting.
- **Durations:** `MM:WW:DD:HH:MM`, with MM/WW/DD shown only when non-zero (90m → `01:30`;
  8d 2h → `01:01:02:00`).
- **Absolute dates:** current calendar date shows **no date label (not even "Today")** — bare
  time; previous → "yesterday"/exact; next → "tomorrow"/exact; farther → exact date.

---
