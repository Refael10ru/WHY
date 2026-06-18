#!/usr/bin/env node
// Tests for comment-mode hook.
// Run: node tests/test_comment_mode.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const { safeCreateFlag, flagIsActive, safeUnlinkFlag, ADDITIONAL_CONTEXT } =
  require('../src/comment-mode');

const hookScript = path.resolve(__dirname, '../src/comment-mode.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-mode-test-'));
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

function runHook(args, stdinData, claudeConfigDir) {
  return spawnSync(process.execPath, [hookScript, ...args], {
    input: stdinData || '',
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir }
  });
}

function promptInput(prompt) {
  return JSON.stringify({ prompt, session_id: 'test' });
}

// --- safeCreateFlag ---

console.log('\nsafeCreateFlag\n');

test('creates flag in normal directory', (tmp) => {
  const fp = path.join(tmp, '.comment-mode');
  safeCreateFlag(fp);
  assert.ok(fs.existsSync(fp));
  assert.ok(fs.lstatSync(fp).isFile());
});

test('creates parent directory if missing', (tmp) => {
  const fp = path.join(tmp, 'nested', 'dir', '.comment-mode');
  safeCreateFlag(fp);
  assert.ok(fs.existsSync(fp));
});

test('creates flag through symlinked parent owned by current user', (tmp) => {
  const realDir = path.join(tmp, 'real');
  fs.mkdirSync(realDir);
  const linkDir = path.join(tmp, 'link');
  fs.symlinkSync(realDir, linkDir);
  safeCreateFlag(path.join(linkDir, '.comment-mode'));
  assert.ok(fs.existsSync(path.join(realDir, '.comment-mode')));
});

test('refuses when flag file is itself a symlink', (tmp) => {
  const decoy = path.join(tmp, 'decoy.txt');
  fs.writeFileSync(decoy, 'ATTACK');
  const fp = path.join(tmp, '.comment-mode');
  fs.symlinkSync(decoy, fp);
  safeCreateFlag(fp);
  assert.strictEqual(fs.readFileSync(decoy, 'utf8'), 'ATTACK');
});

test('flag file permissions are 0600', (tmp) => {
  if (process.platform === 'win32') return;
  const fp = path.join(tmp, '.comment-mode');
  safeCreateFlag(fp);
  const mode = fs.statSync(fp).mode & 0o777;
  assert.strictEqual(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
});

// --- flagIsActive ---

console.log('\nflagIsActive\n');

test('returns false when file missing', (tmp) => {
  assert.strictEqual(flagIsActive(path.join(tmp, '.comment-mode')), false);
});

test('returns true when regular file exists', (tmp) => {
  const fp = path.join(tmp, '.comment-mode');
  fs.writeFileSync(fp, 'on');
  assert.strictEqual(flagIsActive(fp), true);
});

test('returns false when path is a symlink', (tmp) => {
  const target = path.join(tmp, 'target.txt');
  fs.writeFileSync(target, 'on');
  const fp = path.join(tmp, '.comment-mode');
  fs.symlinkSync(target, fp);
  assert.strictEqual(flagIsActive(fp), false);
});

// --- safeUnlinkFlag ---

console.log('\nsafeUnlinkFlag\n');

test('removes existing flag', (tmp) => {
  const fp = path.join(tmp, '.comment-mode');
  fs.writeFileSync(fp, 'on');
  safeUnlinkFlag(fp);
  assert.strictEqual(fs.existsSync(fp), false);
});

test('no-ops when file missing', (tmp) => {
  assert.doesNotThrow(() => safeUnlinkFlag(path.join(tmp, '.comment-mode')));
});

// --- Hook integration ---

console.log('\nHook integration\n');

test('/comment-mode on creates flag and emits additionalContext', (tmp) => {
  const result = runHook([], promptInput('/comment-mode on'), tmp);
  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(tmp, '.comment-mode')));
  const out = JSON.parse(result.stdout);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('COMMENT MODE ACTIVE'));
});

test('/comment-mode:comment-mode on (namespaced) creates flag', (tmp) => {
  const result = runHook([], promptInput('/comment-mode:comment-mode on'), tmp);
  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(path.join(tmp, '.comment-mode')));
});

test('/comment-mode off removes flag and emits nothing', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook([], promptInput('/comment-mode off'), tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(fs.existsSync(path.join(tmp, '.comment-mode')), false);
  assert.strictEqual(result.stdout.trim(), '');
});

test('/comment-mode:comment-mode off (namespaced) removes flag', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook([], promptInput('/comment-mode:comment-mode off'), tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(fs.existsSync(path.join(tmp, '.comment-mode')), false);
});

test('unrelated prompt with active flag emits additionalContext', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook([], promptInput('fix the bug'), tmp);
  assert.strictEqual(result.status, 0);
  const out = JSON.parse(result.stdout);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('COMMENT MODE ACTIVE'));
});

test('unrelated prompt with no flag emits nothing', (tmp) => {
  const result = runHook([], promptInput('fix the bug'), tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), '');
});

test('--session-start clears flag', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.comment-mode'), 'on');
  const result = runHook(['--session-start'], '', tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(fs.existsSync(path.join(tmp, '.comment-mode')), false);
});

test('--session-start no-ops when flag absent', (tmp) => {
  const result = runHook(['--session-start'], '', tmp);
  assert.strictEqual(result.status, 0);
});

test('additionalContext contains all required elements', (tmp) => {
  assert.ok(ADDITIONAL_CONTEXT.includes('WHY'));
  assert.ok(ADDITIONAL_CONTEXT.includes('how it helps'));
  assert.ok(ADDITIONAL_CONTEXT.includes('radically different'));
  assert.ok(ADDITIONAL_CONTEXT.includes('language-appropriate'));
});

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
