---
description: Audit and update Timekeeper project skills
command_name: audit-skills
---

# Audit Timekeeper Skills

Checks if existing skills are up-to-date and detects if new skills should be created.

## What This Checks

### Existing Skills Status
- **run-timekeeper**: Verifies dev server launch instructions match current Vite config
- **test-timekeeper**: Confirms test runner matches vitest configuration
- **build-timekeeper**: Validates build process against vite.config.ts

### New Skills to Add
- Checks for new npm scripts in package.json
- Detects new major features or components
- Scans for new testing patterns or tooling

## Run Audit

```bash
npm run audit-skills
```

Or manually:
```bash
# List all package.json scripts
jq '.scripts | keys[]' apps/web/package.json

# Check Vite config
cat apps/web/vite.config.ts

# List current skills
ls -la .claude/skills/
```

## Update Indicators

These suggest a skill needs updating:
- Package versions changed significantly (e.g., React 18→19)
- New scripts added to package.json (e.g., `lint`, `format`, `analyze`)
- Build config changed (vite.config.ts modified)
- Major dependency added (e.g., testing library, E2E framework)
- New patterns in app (e.g., new deployments, new test runners)

## Common Updates

If these change, regenerate skills:

```bash
# After updating dependencies
npm run audit-skills

# After adding new scripts
npm run audit-skills

# After major config changes
rm -rf .claude/skills/ && npx /run-skill-generator
```

## Maintenance Strategy

Run this audit:
- After `pnpm upgrade` or major version updates
- When adding new testing frameworks
- When changing build or CI/CD setup
- Quarterly as preventive maintenance
