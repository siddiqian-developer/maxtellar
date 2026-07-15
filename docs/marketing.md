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
| `3pm` | `3:00 PM` |
| `1500` | `3:00 PM` |
| `150` | `1:50 AM` |
| `tom 7am` | `Tomorrow, 7:00 AM` |
| `tmorow 3:pm` | `Tomorrow, 3:00 PM` *(misspellings understood)* |
| `1days, 2.5hr` | `1d 2h 30m` |
| `1h30` | `1h 30m` |

**It plans across days, not just today.** Need a wake-up time that's tomorrow morning, or a deadline next week? Just say `tomorrow` or pick a far date from the calendar — today and tomorrow you simply type.

**It never silently changes your meaning.** If something you enter has to be adjusted — a time that's already past, an end that lands before its start, a duration below the minimum — maxtellar makes the fix *and tells you it did*, right there, and offers the obvious alternative ("Did you mean tomorrow?") with one tap. The correction happens the moment you enter it, so a wrong value never slips into your plan unnoticed.

**Two-staged, and always dependable.** A fast, deterministic grammar handles the vast majority of what you type — predictable, private, and instant, running entirely on your device. When an input is genuinely ambiguous, an on-device ML layer steps in to interpret intent, leaning on the smarter reading when the plain rules aren't sure. The intelligent layer only ever *helps*; the app works fully without it, so your planning is never blocked waiting on a model.

*The result: entering time feels like talking, not filling out a form — and you can trust that what you meant is what got saved.*
