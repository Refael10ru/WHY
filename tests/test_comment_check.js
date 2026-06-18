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
  // WHY: each test gets its own tmp dir so flag-file state never bleeds between tests;
  // using mkdtemp instead of a shared dir prevents order-dependent failures.
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
