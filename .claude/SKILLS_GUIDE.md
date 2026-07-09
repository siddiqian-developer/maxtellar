# Timekeeper Project Skills Guide

This project includes Claude Code skills to streamline development workflows.

## Available Skills

### `/run` — Start the Development Server
**File**: `skills/run-timekeeper/SKILL.md`

Launches the Vite dev server for Timekeeper on http://localhost:5173.

- Watches for file changes
- Supports hot module reloading
- Theme toggle button in topbar (☀️/🌙/🔄)

**Usage**:
```bash
/run
```

### `/test` — Run Test Suite
**File**: `skills/test-timekeeper/SKILL.md`

Runs the Vitest test suite with output in terminal.

- Single-run or watch mode
- Coverage reporting available
- Includes component and utility tests

**Usage**:
```bash
/test
```

### `/build` — Build for Production
**File**: `skills/build-timekeeper/SKILL.md`

Creates an optimized production bundle via Vite.

- Type checks all packages
- Outputs to `dist/`
- Preview mode for testing production bundle

**Usage**:
```bash
/build
```

### `/audit-skills` — Audit Project Skills
**File**: `skills/audit-skills/SKILL.md`

Checks if existing skills are current and detects if new skills should be added.

- Verifies skill docs match actual project config
- Detects new npm scripts
- Suggests when skills need regeneration

**Usage**:
```bash
/audit-skills
```

## Automated Skill Verification

### Manual Audit
Run the audit script directly:
```bash
node .claude/check-skills.mjs
```

### When to Run Audits
- After dependency updates (`pnpm upgrade`)
- When adding new npm scripts
- After major config changes
- Quarterly as preventive maintenance

### Signs Skills Need Updating
- Build process changes in `vite.config.ts`
- New test framework or runner added
- Port numbers change
- New development tools integrated
- Major framework version upgrades

## Skill Updates

If audit detects outdated skills, regenerate them:

```bash
# Use Claude Code's built-in generator
/run-skill-generator
```

This will create fresh, accurate skill documentation based on current project state.

## Adding New Skills

When you add new tooling or workflows:

1. Create a new directory: `.claude/skills/<feature-name>/`
2. Add `SKILL.md` with:
   - `description`: One-line summary
   - `command_name`: Slash command (e.g., `lint`)
   - Instructions for running the feature
   - Verification steps
   - Troubleshooting tips

3. Run the audit: `node .claude/check-skills.mjs`

## Structure

```
.claude/
├── settings.json           # Global Claude Code settings
├── check-skills.mjs        # Audit script (run anytime)
├── SKILLS_GUIDE.md         # This file
└── skills/
    ├── run-timekeeper/
    │   └── SKILL.md        # Dev server
    ├── test-timekeeper/
    │   └── SKILL.md        # Test runner
    ├── build-timekeeper/
    │   └── SKILL.md        # Production build
    └── audit-skills/
        └── SKILL.md        # Skill auditor
```

## Tips

- Skills are project-specific and shared with team via git
- Each skill's `SKILL.md` is the source of truth for that workflow
- Keep skills concise — one clear purpose per skill
- Link skills in your READMEs for team onboarding
