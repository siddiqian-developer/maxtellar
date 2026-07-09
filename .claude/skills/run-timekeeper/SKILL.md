---
description: Start the Timekeeper web app dev server
command_name: run
workspace_filter: "apps/web"
---

# Run Timekeeper

Launches the Vite dev server for the Timekeeper web app on http://localhost:5173.

## Prerequisites

- Node.js and pnpm installed
- Port 5173 available

## Launch

```bash
cd apps/web
npm run dev
```

The dev server will start and watch for file changes. The app loads at `http://localhost:5173`.

## Verification

The app is ready when you see:
- "VITE" banner in console
- "ready in X ms" message
- App renders with Timekeeper title and task timeline

## Features to Drive

- **Timeline**: Scroll the main canvas to see task blocks and now-seam indicator
- **Pipeline**: Right sidebar shows upcoming tasks
- **Theme Toggle**: Click theme button (☀️/🌙/🔄) in topbar to cycle themes
- **New Task**: Click + button to create a task via drawer
- **Metrics**: "accounted" and "lost" time shown in topbar

## Stop

Ctrl+C in the terminal running the dev server.
