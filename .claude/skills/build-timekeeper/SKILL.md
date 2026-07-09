---
description: Build the Timekeeper web app for production
command_name: build
workspace_filter: "apps/web"
---

# Build Timekeeper

Builds an optimized production bundle of the Timekeeper web app.

## Build for Production

```bash
npm run build
```

This:
1. Runs TypeScript type checking across all packages
2. Builds the Vite bundle with optimizations
3. Outputs to `apps/web/dist/`

## Output

Build artifacts are in `dist/`:
- `index.html` - Entry point
- `assets/` - Bundled JS, CSS, and other assets
- Ready to deploy to any static host

## Preview Built Bundle

```bash
npm run preview
```

Starts a local server at `http://localhost:4173` to preview the production build.

## Build Failure Diagnostics

If build fails:
1. Check TypeScript errors: `npm run typecheck`
2. Check for missing dependencies: `pnpm install`
3. Clear build cache: `rm -rf dist && npm run build`
