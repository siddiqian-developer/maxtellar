# maxtellar — every minute accounted

**maxtellar is an opinionated time-management app for people who want their whole day to add up.** Not a to-do list that forgets what you didn't do — a single, honest timeline where planned time, worked time, wasted time, and the hours that simply slipped away all land somewhere. Nothing escapes the ledger.

This document is the public product story. It grows feature by feature as the app does.

---

## Features

### Smart input — type time the way you say it

You shouldn't have to translate what's in your head into a rigid clock format. maxtellar's task entry reads **casual time, dates, and durations** and formats them for you, instantly, into your chosen style (12-hour or 24-hour).

Type it loosely; it lands exactly right:

| You type | You get |
|---|---|
| `3pm` | `03:00 PM` |
| `1500` | `03:00 PM` |
| `150` | `01:50 AM` |
| `tom 7am` | `Tomorrow, 07:00 AM` |
| `tmorow 3:pm` | `Tomorrow, 03:00 PM` *(misspellings understood)* |
| `1days, 2.5hr` | `1d 2h 30m` |
| `1h30` | `1h 30m` |

**It plans across days, not just today.** Need a wake-up time that's tomorrow morning, or a deadline next week? Just say `tomorrow` or pick a far date from the calendar — today and tomorrow you simply type.

**It never silently changes your meaning.** If something you enter has to be adjusted — a time that's already past, an end that lands before its start, a duration below the minimum — maxtellar makes the fix *and tells you it did*, right there, and offers the obvious alternative ("Did you mean tomorrow?") with one tap. The correction happens the moment you enter it, so a wrong value never slips into your plan unnoticed.

**Two-staged, and always dependable.** A fast, deterministic grammar handles the vast majority of what you type — predictable, private, and instant, running entirely on your device. When an input is genuinely ambiguous, **on-device AI** steps in to interpret intent, leaning on the smarter reading when the plain rules aren't sure. The AI only ever *helps*; the app works fully without it, so your planning is never blocked waiting on a model.

*The result: entering time feels like talking, not filling out a form — and you can trust that what you meant is what got saved.*

### Break big tasks down — with AI that learns *your* breakdowns

A big task isn't one block of time; it's a handful of smaller moves. maxtellar lets you **compose a task from subtasks** — "Write essay" becomes *Outline*, *Draft*, *Cite*. The subtasks are what actually run and get scheduled; the parent is a bracket that tracks the whole thing, and its budget is always exactly the sum of its parts. Start the first, and the app walks you through to the last; finish the last and the parent completes itself. Your timeline even keeps the bracket over finished subtasks, so the record shows *this was one composed effort*.

**And the AI remembers how you work.** The next time you start a task like one you've broken down before, maxtellar's **on-device AI recognizes it and offers the same breakdown, ready to drop in** — one tap and your subtasks are there. It learns from *your* history, on *your* device: no cloud, no accounts, nothing leaves the machine. The more you plan, the smarter it gets about how *you* plan.

### Your AI, your call — maximum smarts or featherweight

Every AI feature in maxtellar is **on-device and optional**. Run it at **Maximum AI** for the full experience — smart sub-head suggestions, learned task breakdowns, natural-language time parsing. On a low-end machine, flip a single switch to **Lightweight** and the app drops to its fast deterministic paths. Either way nothing is ever *blocked* on the AI — it's help, not a dependency. You choose how much horsepower to spend.

*The result: intelligence that's genuinely yours — private, personal, and always in your control.*
