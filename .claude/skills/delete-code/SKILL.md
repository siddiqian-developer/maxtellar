---
description: The "code is disposable" purge — deletes all code from maxtellar, keeping only the markdown (specs/, docs/, .claude/) from which the app is regenerated. Use when the user says "delete the code", "wipe the code", "start code from scratch", or invokes /delete-code.
---

# Delete Code

Executes the destructive half of the regenerability law (spec §7.0): remove every
build artifact, keep the markdown that *is* the app.

## Safety first — always

1. Confirm with the user before deleting (this is destructive, even with git).
2. Snapshot: `git add -A && git commit -m "pre-delete-code snapshot"` (create the
   repo with `git init` if it somehow doesn't exist). Never skip this.

## Delete (code and build artifacts)

```
apps/            # web app source
packages/        # core + store source
node_modules/
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
tsconfig.base.json
```

## Keep (the app, in markdown)

```
specs/           # the law — Parts I–X via 00-index.md
docs/            # design-tokens.md, implementation references
.claude/         # skills, settings, audit script
.git/            # history, incl. the pre-delete snapshot
```

## After deleting

Tell the user the repo is markdown-only and that "regenerate the app" will rebuild
from `specs/00-index.md` + `docs/` per §7.0: pnpm monorepo (spec §7.2 stack:
core/store packages + React 18 Vite PWA), build order §7.3, visual values from
`docs/design-tokens.md`, drawer per Part VI + `docs/drawer-reference.md`.

## Regeneration acceptance bar

The regenerated app must match the md exactly — §7.2 stack, §7.3 build order,
all G/E/R rules, design tokens verbatim. Any mismatch means the markdown was
incomplete: fix the markdown (not just the code) so the next cycle is lossless.
