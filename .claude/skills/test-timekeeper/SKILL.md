---
description: Run the Timekeeper test suite
command_name: test
workspace_filter: "apps/web"
---

# Test Timekeeper

Runs the Vitest test suite for the Timekeeper web app.

## Run Tests

```bash
cd apps/web
npm run test
```

Runs all test files matching `*.test.ts` or `*.test.tsx` in single-run mode.

## Coverage

To run with coverage:
```bash
npm run test -- --coverage
```

## Test Files

- `src/time.test.ts` - Time formatting and calculation tests
- Component tests in respective component directories

## Continuous Mode

For watch mode during development:
```bash
cd apps/web
npx vitest
```

Press `q` to quit watch mode.
