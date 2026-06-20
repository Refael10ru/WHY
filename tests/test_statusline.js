#!/usr/bin/env node
// Tests for why-mode-statusline.sh
// Run: node tests/test_statusline.js

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '../src/why-mode-statusline.sh');

let passed = 0;
let failed = 0;

function test(name, fn) {
  // WHY: isolated tmp dir per test prevents flag-file state bleeding between cases,
  // same pattern as other test files in this repo.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'why-statusline-test-'));
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

function runScript(claudeConfigDir) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
  });
}

console.log('\nwhy-mode-statusline.sh\n');

test('outputs nothing when flag absent', (tmp) => {
  const result = runScript(tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('outputs [WHY] badge when flag present', (tmp) => {
  // WHY: create the flag file to simulate active why-mode, then assert badge appears.
  fs.writeFileSync(path.join(tmp, '.why-mode'), '');
  const result = runScript(tmp);
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('[WHY]'), `expected [WHY] in output, got: ${JSON.stringify(result.stdout)}`);
});

test('badge has leading space for separator from preceding badges', (tmp) => {
  // WHY: leading space prevents [CAVEMAN][WHY] smash — confirmed in script source.
  fs.writeFileSync(path.join(tmp, '.why-mode'), '');
  const result = runScript(tmp);
  assert.ok(result.stdout.startsWith(' '), `expected leading space, got: ${JSON.stringify(result.stdout)}`);
});

test('outputs nothing when flag is a symlink', (tmp) => {
  // WHY: symlink guard blocks path-traversal attack where attacker points flag
  // at ~/.ssh/id_rsa and statusline renders its bytes to terminal every keystroke.
  const target = path.join(tmp, 'target');
  const link = path.join(tmp, '.why-mode');
  fs.writeFileSync(target, '');
  fs.symlinkSync(target, link);
  const result = runScript(tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

console.log('');
if (failed > 0) {
  console.error(`${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`${passed} passed`);
}
