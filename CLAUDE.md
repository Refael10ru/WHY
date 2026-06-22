# why-mode — development guide

## Before submitting work

Run both checks and fix any failures before opening a PR or pushing:

```bash
npm run lint       # biome lint + format check (src/, bin/, tests/)
npm run test:all   # all 4 test suites
```

Auto-fix most lint issues with:

```bash
npm run lint:fix
```

Remaining errors after `lint:fix` must be fixed manually.

## Project structure

```
src/           hook scripts (why-mode.js, why-check.js, statusline)
bin/           npx installer (install.js)
tests/         node test suites (no test runner needed)
commands/      Claude Code slash command definition
.claude-plugin/ plugin manifest (plugin.json, marketplace.json)
```

## Running tests

```bash
npm test          # why-mode.js tests only
npm run test:all  # all suites: why-mode, why-check, manifest, statusline
```

## Linter

[Biome](https://biomejs.dev) — configured in `biome.json`. Covers `src/`, `bin/`, `tests/`. Rules: recommended preset, double quotes, tab indentation.
