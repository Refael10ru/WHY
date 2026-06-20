#!/usr/bin/env node
// Tests for plugin manifests and statusline script I/O.
// Run: node tests/test_manifest.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pluginJsonPath = path.join(root, '.claude-plugin', 'plugin.json');
const marketplaceJsonPath = path.join(root, '.claude-plugin', 'marketplace.json');
const statuslineScript = path.join(root, 'src', 'why-mode-statusline.sh');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'why-manifest-test-'));
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

// --- plugin.json structure ---

console.log('\nplugin.json structure\n');

let plugin;
test('plugin.json is valid JSON', () => {
  plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
});

test('plugin.json has name', () => {
  assert.strictEqual(typeof plugin.name, 'string');
  assert.ok(plugin.name.length > 0);
});

test('plugin.json has description', () => {
  assert.strictEqual(typeof plugin.description, 'string');
  assert.ok(plugin.description.length > 0);
});

test('plugin.json has author.name', () => {
  assert.ok(plugin.author && typeof plugin.author.name === 'string');
});

test('plugin.json has statusLine with type and command', () => {
  assert.ok(plugin.statusLine, 'statusLine missing');
  assert.strictEqual(typeof plugin.statusLine.type, 'string');
  assert.strictEqual(typeof plugin.statusLine.command, 'string');
});

test('plugin.json has hooks.SessionStart', () => {
  assert.ok(Array.isArray(plugin.hooks.SessionStart) && plugin.hooks.SessionStart.length > 0);
});

test('plugin.json has hooks.UserPromptSubmit', () => {
  assert.ok(Array.isArray(plugin.hooks.UserPromptSubmit) && plugin.hooks.UserPromptSubmit.length > 0);
});

test('plugin.json has hooks.PreToolUse', () => {
  assert.ok(Array.isArray(plugin.hooks.PreToolUse) && plugin.hooks.PreToolUse.length > 0);
});

// --- marketplace.json structure ---

console.log('\nmarketplace.json structure\n');

let marketplace;
test('marketplace.json is valid JSON', () => {
  marketplace = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf8'));
});

test('marketplace.json has $schema', () => {
  assert.strictEqual(typeof marketplace.$schema, 'string');
  assert.ok(marketplace.$schema.length > 0);
});

test('marketplace.json has name', () => {
  assert.strictEqual(typeof marketplace.name, 'string');
});

test('marketplace.json has description', () => {
  assert.strictEqual(typeof marketplace.description, 'string');
});

test('marketplace.json has owner.name', () => {
  assert.ok(marketplace.owner && typeof marketplace.owner.name === 'string');
});

test('marketplace.json plugins array is non-empty', () => {
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0);
});

test('marketplace.json plugins[0] has name, description, source, category', () => {
  const p = marketplace.plugins[0];
  assert.strictEqual(typeof p.name, 'string');
  assert.strictEqual(typeof p.description, 'string');
  assert.strictEqual(typeof p.source, 'string');
  assert.strictEqual(typeof p.category, 'string');
});

// --- Referenced scripts exist ---

console.log('\nReferenced scripts exist\n');

function extractScriptPaths(obj) {
  const paths = [];
  const regex = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s\\]+)/g;
  const text = JSON.stringify(obj);
  let m;
  while ((m = regex.exec(text)) !== null) {
    paths.push(m[1]);
  }
  return [...new Set(paths)];
}

const allScripts = extractScriptPaths(plugin);

allScripts.forEach(rel => {
  test(`${rel} exists on disk`, () => {
    const abs = path.join(root, rel);
    assert.ok(fs.existsSync(abs), `${abs} not found`);
  });
});

// --- Statusline script I/O ---

console.log('\nStatusline script I/O\n');

function runStatusline(claudeConfigDir) {
  return spawnSync('bash', [statuslineScript], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir }
  });
}

test('no output when flag absent', (tmp) => {
  const result = runStatusline(tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), '');
});

test('outputs [WHY] badge when flag present', (tmp) => {
  fs.writeFileSync(path.join(tmp, '.why-mode'), 'on');
  const result = runStatusline(tmp);
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('[WHY]'), `expected [WHY] in stdout, got: ${JSON.stringify(result.stdout)}`);
});

test('no output when flag is a symlink', (tmp) => {
  const decoy = path.join(tmp, 'decoy.txt');
  fs.writeFileSync(decoy, 'on');
  fs.symlinkSync(decoy, path.join(tmp, '.why-mode'));
  const result = runStatusline(tmp);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), '');
});

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
