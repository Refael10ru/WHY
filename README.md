# why-mode

A Claude Code plugin that enforces inline **WHY** comments on every file edit — so future readers always know why code changed, not just what changed.

## Requirements

- Claude Code (any version supporting `claude plugin install`)
- Node.js ≥18

## Install

```
npx github:Refael10ru/WHY
```

## What it does

When active, why-mode enforces that every file edit includes an inline code comment explaining:

1. **WHY** this change was made
2. **How** it helps
3. If a radically different approach exists, **why it wasn't taken**

Two enforcement layers:

| Layer | Hook | Behavior |
|-------|------|----------|
| Soft | `UserPromptSubmit` | Injects instruction every turn so Claude always knows to add WHY comments |
| Hard | `PreToolUse` | Blocks `Edit`/`Write` tool calls with no comment syntax — Claude must retry with a comment before the edit goes through |

## Usage

```
/why-mode on    # activate
/why-mode off   # deactivate
```

Mode resets at session start — no carry-over between sessions.

## How the hard check works

Every `Edit` or `Write` tool call passes through a `PreToolUse` hook (`src/why-check.js`). The hook scans the edit content for any comment token (`//`, `#`, `/*`, `--`, `<!--`). If none found, it exits with code 2 — Claude Code blocks the edit and Claude sees the error:

```
[why-mode] Edit blocked: no inline WHY comment found.
Retry with a comment explaining why this change was made.
```

Claude retries with a comment. The hook then passes and the edit goes through.

The check fails open: any hook error (bad JSON, filesystem issue) exits 0 so it never breaks sessions when why-mode is off.

## Statusline badge

The `[WHY]` badge appears in your Claude Code statusline automatically when why-mode is active. No manual setup needed — it's wired on install via the `statusLine` field in `plugin.json`.
