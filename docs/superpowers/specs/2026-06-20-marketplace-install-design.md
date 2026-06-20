# Marketplace Install & README Design

**Date:** 2026-06-20
**Status:** Approved

## Overview

Make the why-mode plugin installable via `claude plugin install https://github.com/Refael10ru/WHY` by auditing and completing the existing plugin manifests, and writing a full README that covers requirements, install, usage, and feature explanation.

## Deliverables

1. **`README.md`** — project root, full user-facing docs
2. **`.claude-plugin/plugin.json`** — verify against Claude Code plugin spec, add any missing fields
3. **`.claude-plugin/marketplace.json`** — verify `$schema`, all required fields present

## README Structure

```markdown
# why-mode

One-line description of what the plugin does.

## Requirements

- Claude Code (any version supporting `claude plugin install`)
- Node.js ≥18

## Install

\`\`\`
claude plugin install https://github.com/Refael10ru/WHY
\`\`\`

## What it does

Paragraph: enforces inline WHY comments on every Claude Code file edit.
Two enforcement layers:
  - Soft (UserPromptSubmit): injects instruction each turn so Claude always
    knows to add WHY comments
  - Hard (PreToolUse): blocks Edit/Write tool calls that contain no comment
    syntax — Claude must retry with a comment before the edit goes through

## Usage

\`\`\`
/why-mode on    # activate
/why-mode off   # deactivate
\`\`\`

Mode resets at session start (no carry-over between sessions).

## How the hard check works

Short paragraph explaining: PreToolUse hook fires on every Edit/Write call,
scans new_string/content for comment tokens (//, #, /*, --, <!--), blocks
with exit 2 if none found, Claude sees the error and retries with a comment.
Fails open (exit 0) on any error so it never breaks sessions when mode is off.

## Statusline badge

The `[WHY]` badge is configured automatically on install — no manual setup needed.
```

## Manifest Audit

### `plugin.json`

Already has correct structure:
- `name`, `description`, `author`
- All three hook entries (`SessionStart`, `UserPromptSubmit`, `PreToolUse`) with `command`, `timeout`, `statusMessage`

**Add `statusLine` field** so the badge auto-configures on install:

```json
"statusLine": {
  "type": "command",
  "command": "bash \"${CLAUDE_PLUGIN_ROOT}/src/why-mode-statusline.sh\""
}
```

Check: does the Claude Code plugin spec require a `version` field? Add `"version": "1.0.0"` if so.

### `marketplace.json`

Already has:
- `$schema`, `name`, `description`, `owner`
- `plugins[]` with `name`, `description`, `source: "./"`, `category`

The `source: "./"` value means the plugin root is the repo root — this is correct when `.claude-plugin/` is at the repo root. No change needed.

## Non-Goals

- No install.sh script (claude plugin install handles it)
- No CI/CD pipeline
- No marketplace submission (manual, user-driven)
- No version bumping automation
