# Hard Comment-Check: PreToolUse Hook

**Date:** 2026-06-18
**Status:** Approved

## Overview

Add hard enforcement to the `comment-mode` plugin. When comment-mode is active, a new `PreToolUse` hook inspects every `Edit` and `Write` tool call. If the edit content contains no inline comment, the hook blocks the call (exit 2) and tells Claude to retry with a WHY comment. Soft enforcement (injected instruction via `UserPromptSubmit`) remains unchanged.

## Components

### New file: `src/comment-check.js`

`PreToolUse` hook script. Reads JSON payload from stdin. Logic:

1. Parse stdin as JSON. On parse failure → exit 0 (fail open).
2. Check `flagIsActive` (imported from `comment-mode.js`). If flag absent → exit 0.
3. Check `tool_name` is `Edit` or `Write`. Otherwise → exit 0.
4. Extract edit content:
   - `Edit` → `tool_input.new_string`
   - `Write` → `tool_input.content`
5. If content is empty or whitespace-only → exit 0 (nothing to comment on).
6. Scan content for any comment syntax: `//`, `#`, `/*`, `--`, `<!--`
7. Comment found → exit 0. Not found → exit 2 with stderr:

```
[comment-mode] Edit blocked: no inline WHY comment found. Retry with a comment explaining why this change was made.
```

### `plugin.json` change

Add one entry to `hooks.PreToolUse`:

```json
{
  "type": "command",
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/comment-check.js\"",
  "timeout": 5,
  "statusMessage": "Checking for WHY comment..."
}
```

### No changes to `comment-mode.js`

`comment-check.js` requires `{ flagIsActive }` from `./comment-mode`. Flag file path and detection logic are reused as-is.

## Data Flow

```
Agent calls Edit/Write
  → PreToolUse fires → comment-check.js
      → flag inactive?           → exit 0 (pass)
      → not Edit/Write?          → exit 0 (pass)
      → content empty?           → exit 0 (pass)
      → comment syntax found?    → exit 0 (pass)
      → else                     → exit 2 + error → edit blocked
          → Claude retries with comment
          → hook passes → edit proceeds
```

## Comment Syntax Detection

Language-agnostic heuristic. Checks for presence of any of:

| Token | Languages |
|-------|-----------|
| `//`  | JS, TS, Go, Rust, Java, C/C++, Swift, Kotlin, ... |
| `#`   | Python, Ruby, Shell, YAML, TOML, ... |
| `/*`  | C, JS, CSS, ... |
| `--`  | SQL, Lua, Haskell, ... |
| `<!--`| HTML, XML, Markdown, ... |

No attempt to parse language or validate comment placement. If the string appears anywhere in the edit content, the check passes.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Flag absent (mode off) | Pass — no check |
| Tool is `Read`, `Bash`, etc. | Pass — only Edit/Write checked |
| `new_string` empty or whitespace | Pass — nothing to comment on |
| stdin not valid JSON | Pass — fail open |
| Filesystem error reading flag | Pass — fail open |

## Non-Goals

- No language-aware comment validation (position, structure, content) — see Future Work
- No change to `UserPromptSubmit` soft enforcement
- No new flag file format or mode values
- No `SessionStart` changes

## Future Work

### Language-aware comment validation

Current heuristic (token substring scan) can false-pass on non-comment uses of `//`, `#`, `--`, etc. (e.g. URLs, string literals, SQL value strings).

**TODO:** Replace heuristic with per-language AST/token parsing via an external tool invoked from `comment-check.js`. Candidate approach:

- Detect file language from `tool_input.path` extension (or shebang for scripts)
- Shell out to a language-appropriate parser/linter that can verify a comment is present on changed lines:
  - JS/TS: `tree-sitter` or `acorn` to walk the AST and confirm a `Line/BlockComment` node exists in the diff region
  - Python: `ast` module (via `python3 -c`) to check for `Expr(Constant(...))` docstrings or `# comment` nodes
  - Generic fallback: keep current heuristic for unsupported languages
- The external tool call stays inside `comment-check.js`; `plugin.json` needs no changes
