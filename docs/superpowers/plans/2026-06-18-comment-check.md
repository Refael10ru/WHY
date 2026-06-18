# Hard Comment-Check: PreToolUse Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PreToolUse` hook to the `comment-mode` plugin that blocks `Edit`/`Write` tool calls with no inline comment when comment-mode is active.

**Architecture:** New file `src/comment-check.js` reads the existing flag file (via `flagIsActive` from `comment-mode.js`) and inspects `new_string`/`content` of Edit/Write tool calls for comment syntax tokens. On failure → exit 2 + stderr. Registered in `plugin.json` as a new `PreToolUse` hook.

**Tech Stack:** Node.js ≥18, no external dependencies. Homegrown test runner (see `tests/test_comment_mode.js`).

## Global Constraints

- Node.js ≥18 (per `package.json` `engines` field)
- No new npm dependencies
- Test runner style: homegrown `test(name, fn)` with `assert` module + `spawnSync` for integration. Match pattern in `tests/test_comment_mode.js` exactly.
- All tests run with `node tests/<filename>.js`
- Fail open: any error (parse, fs) → exit 0 (never break non-comment-mode sessions)
- Exit 2 = block tool call (Claude Code PreToolUse convention). Write error to stderr.

---

### Task 1: `src/comment-check.js` with full test coverage

**Files:**
- Create: `src/comment-check.js`
- Create: `tests/test_comment_check.js`
- Modify: `package.json` (add `test:all` script)

**Interfaces:**
- Consumes: `{ flagIsActive }` from `./comment-mode` (already exported at line 112)
- Produces: `{ hasCommentSyntax }` exported for unit testing. Hook reads from stdin, writes to stderr on block, exits with 0 or 2.

**PreToolUse stdin payload shape** (Claude Code):
```json
{
  "tool_name": "Edit",
  "tool_input": {
    "path": "src/foo.js",
    "old_string": "...",
    "new_string": "..."
  }
}
```
For `Write`: `tool_input.content` instead of `tool_input.new_string`.

- [ ] **Step 1: Write the failing test file**

Create `tests/test_comment_check.js`:

```js
#!/usr/bin/env node
// Tests for comment-check PreToolUse hook.
// Run: node tests/test_comment_check.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const { hasCommentSyntax } = require('../src/comment-check');

const hookScript = path.resolve(__dirname, '../src/comment-check.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-test-'));
  try {
    fn(tmp);
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function runHook(stdinData, claudeConfigDir) {
  return spawnSync(process.execPath, [hookScript], {
    input: stdinData,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir }
  });
}

function editPayload(newString, filePath = 'src/foo.js') {
  return JSON.stringify({
    tool_name: 'Edit',
    tool_input: { path: filePath, old_string: 'old', new_string: newString }
  });
}

function writePayload(content, filePath = 'src/foo.js') {
  return JSON.stringify({
    tool_name: 'Write',
    tool_input: { path: filePath, content }
  });
}

// --- hasCommentSyntax ---

console.log('\nhasCommentSyntax\n');

test('detects // comment', () => {
  assert.ok(hasCommentSyntax('const x = 1; // why: sets default'));
});

test('detects # comment', () => {
  assert.ok(hasCommentSyntax('x = 1  # why: sets default'));
});

test('detects /* comment', () => {
  assert.ok(hasCommentSyntax('/* why: sets default */ const x = 1;'));
});

test('detects -- comment', () => {
  assert.ok(hasCommentSyntax('SELECT 1 -- why: health check'));
});

test('detects <!-- comment', () => {
  assert.ok(hasCommentSyntax('<!-- why: sets default --><div>'));
});

test('returns false when no comment syntax', () => {
  assert.strictEqual(hasCommentSyntax('const x = 1;'), false);
});

test('returns false on empty string', () => {
  assert.strictEqual(hasCommentSyntax(''), false);
});

test('returns false on whitespace only', () => {
  assert.strictEqual(hasCommentSyntax('   \n  '), false);
});

// --- Hook integration: flag inactive ---

console.log('\nHook integration — flag inactive\n');

test('Edit with no comment passes when flag absent', (tmp) => {
  const result = runHook(editPayload('const x = 1;'), tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stderr.trim(), '');
});

test('Write with no comment passes when flag absent', (tmp) => {
  const result = runHook(writePayload('const x = 1;'), tmp);
  assert.strictEqual(result.status, 0);
});

// --- Hook integration: flag active ---

console.log('\nHook integration — flag active\n');

test('Edit with comment passes when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(editPayload('const x = 1; // why: default'), tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stderr.trim(), '');
});

test('Edit with no comment blocks when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(editPayload('const x = 1;'), tmp);
  assert.strictEqual(result.status, 2);
  assert.ok(result.stderr.includes('[comment-mode]'));
  assert.ok(result.stderr.includes('blocked'));
});

test('Write with comment passes when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(writePayload('x = 1  # why: default'), tmp);
  assert.strictEqual(result.status, 0);
});

test('Write with no comment blocks when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(writePayload('const x = 1;'), tmp);
  assert.strictEqual(result.status, 2);
  assert.ok(result.stderr.includes('[comment-mode]'));
});

test('non-Edit/Write tool passes even with no comment and flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  const result = runHook(payload, tmp);
  assert.strictEqual(result.status, 0);
});

test('empty new_string passes when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(editPayload(''), tmp);
  assert.strictEqual(result.status, 0);
});

test('whitespace-only content passes when flag active', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(editPayload('   \n  '), tmp);
  assert.strictEqual(result.status, 0);
});

test('invalid JSON input exits 0 (fail open)', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook('not json', tmp);
  assert.strictEqual(result.status, 0);
});

// --- Error message quality ---

console.log('\nError message\n');

test('block message tells Claude to retry with WHY comment', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(editPayload('const x = 1;'), tmp);
  assert.ok(result.stderr.includes('Retry'));
  assert.ok(result.stderr.toLowerCase().includes('comment'));
});

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node tests/test_comment_check.js
```

Expected: error — `Cannot find module '../src/comment-check'`

- [ ] **Step 3: Implement `src/comment-check.js`**

Create `src/comment-check.js`:

```js
#!/usr/bin/env node
// comment-check — Claude Code PreToolUse hook
//
// Blocks Edit/Write tool calls that contain no inline comment when
// comment-mode flag is active. Exit 2 = block. Exit 0 = pass.

const { flagIsActive } = require('./comment-mode');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.comment-mode');

const COMMENT_TOKENS = ['//', '#', '/*', '--', '<!--'];

function hasCommentSyntax(content) {
  return COMMENT_TOKENS.some(token => content.includes(token));
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      if (!flagIsActive(flagPath)) process.exit(0);

      const data = JSON.parse(input);
      const toolName = data.tool_name || '';

      if (toolName !== 'Edit' && toolName !== 'Write') process.exit(0);

      const ti = data.tool_input || {};
      const content = toolName === 'Edit' ? (ti.new_string || '') : (ti.content || '');

      if (!content.trim()) process.exit(0);

      if (hasCommentSyntax(content)) process.exit(0);

      process.stderr.write(
        '[comment-mode] Edit blocked: no inline WHY comment found. ' +
        'Retry with a comment explaining why this change was made.\n'
      );
      process.exit(2);
    } catch (e) {
      process.exit(0);
    }
  });
}

module.exports = { hasCommentSyntax };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node tests/test_comment_check.js
```

Expected: all tests pass, `0 failed`

- [ ] **Step 5: Update `package.json` to expose `test:all` script**

In `package.json`, add `test:all` alongside existing `test`:

```json
{
  "name": "comment-mode",
  "version": "1.0.0",
  "description": "Claude Code hook: enforce inline WHY comments on all file edits",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node tests/test_comment_mode.js",
    "test:all": "node tests/test_comment_mode.js && node tests/test_comment_check.js"
  }
}
```

- [ ] **Step 6: Run full test suite to verify nothing broken**

```bash
npm run test:all
```

Expected: all tests from both files pass.

- [ ] **Step 7: Commit**

```bash
git add src/comment-check.js tests/test_comment_check.js package.json
git commit -m "feat: add PreToolUse hard comment-check hook"
```

---

### Task 2: Register `PreToolUse` hook in `plugin.json`

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: `src/comment-check.js` (created in Task 1)
- Produces: live hook firing on every Edit/Write tool call when installed

- [ ] **Step 1: Add `PreToolUse` entry to `plugin.json`**

Current `.claude-plugin/plugin.json` has `SessionStart` and `UserPromptSubmit` keys. Add `PreToolUse` at the same level:

```json
{
  "name": "comment-mode",
  "description": "Enforce inline WHY comments on all file edits. Toggle with /comment-mode on|off.",
  "author": {
    "name": "refael"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/comment-mode.js\" \"--session-start\"",
            "timeout": 5,
            "statusMessage": "Resetting comment mode..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/comment-mode.js\"",
            "timeout": 5,
            "statusMessage": "Tracking comment mode..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/comment-check.js\"",
            "timeout": 5,
            "statusMessage": "Checking for WHY comment..."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Run full test suite one final time**

```bash
npm run test:all
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: wire comment-check into plugin.json PreToolUse hook"
```
