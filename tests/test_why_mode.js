#!/usr/bin/env node
// Tests for why-mode hook.
// Run: node tests/test_why_mode.js

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const { safeCreateFlag, flagIsActive, safeUnlinkFlag, ADDITIONAL_CONTEXT } =
	require("../src/why-mode");

const hookScript = path.resolve(__dirname, "../src/why-mode.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "why-mode-test-"));
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
		input: stdinData || "",
		encoding: "utf8",
		env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
	});
}

function promptInput(prompt) {
	return JSON.stringify({ prompt, session_id: "test" });
}

// --- safeCreateFlag ---

console.log("\nsafeCreateFlag\n");

test("creates flag in normal directory", (tmp) => {
	const fp = path.join(tmp, ".why-mode");
	safeCreateFlag(fp);
	assert.ok(fs.existsSync(fp));
	assert.ok(fs.lstatSync(fp).isFile());
});

test("creates parent directory if missing", (tmp) => {
	const fp = path.join(tmp, "nested", "dir", ".why-mode");
	safeCreateFlag(fp);
	assert.ok(fs.existsSync(fp));
});

test("creates flag through symlinked parent owned by current user", (tmp) => {
	const realDir = path.join(tmp, "real");
	fs.mkdirSync(realDir);
	const linkDir = path.join(tmp, "link");
	fs.symlinkSync(realDir, linkDir);
	safeCreateFlag(path.join(linkDir, ".why-mode"));
	assert.ok(fs.existsSync(path.join(realDir, ".why-mode")));
});

test("refuses when flag file is itself a symlink", (tmp) => {
	const decoy = path.join(tmp, "decoy.txt");
	fs.writeFileSync(decoy, "ATTACK");
	const fp = path.join(tmp, ".why-mode");
	fs.symlinkSync(decoy, fp);
	safeCreateFlag(fp);
	assert.strictEqual(fs.readFileSync(decoy, "utf8"), "ATTACK");
});

test("flag file permissions are 0600", (tmp) => {
	if (process.platform === "win32") return;
	const fp = path.join(tmp, ".why-mode");
	safeCreateFlag(fp);
	const mode = fs.statSync(fp).mode & 0o777;
	assert.strictEqual(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
});

// --- flagIsActive ---

console.log("\nflagIsActive\n");

test("returns false when file missing", (tmp) => {
	assert.strictEqual(flagIsActive(path.join(tmp, ".why-mode")), false);
});

test("returns true when regular file exists", (tmp) => {
	const fp = path.join(tmp, ".why-mode");
	fs.writeFileSync(fp, "on");
	assert.strictEqual(flagIsActive(fp), true);
});

test("returns false when path is a symlink", (tmp) => {
	const target = path.join(tmp, "target.txt");
	fs.writeFileSync(target, "on");
	const fp = path.join(tmp, ".why-mode");
	fs.symlinkSync(target, fp);
	assert.strictEqual(flagIsActive(fp), false);
});

// --- safeUnlinkFlag ---

console.log("\nsafeUnlinkFlag\n");

test("removes existing flag", (tmp) => {
	const fp = path.join(tmp, ".why-mode");
	fs.writeFileSync(fp, "on");
	safeUnlinkFlag(fp);
	assert.strictEqual(fs.existsSync(fp), false);
});

test("no-ops when file missing", (tmp) => {
	assert.doesNotThrow(() => safeUnlinkFlag(path.join(tmp, ".why-mode")));
});

// --- Hook integration ---

console.log("\nHook integration\n");

test("/why-mode on creates flag and emits additionalContext", (tmp) => {
	const result = runHook([], promptInput("/why-mode on"), tmp);
	assert.strictEqual(result.status, 0);
	assert.ok(fs.existsSync(path.join(tmp, ".why-mode")));
	const out = JSON.parse(result.stdout);
	assert.ok(
		out.hookSpecificOutput.additionalContext.includes("WHY MODE ACTIVE"),
	);
});

test("/why-mode:why-mode on (namespaced) creates flag", (tmp) => {
	const result = runHook([], promptInput("/why-mode:why-mode on"), tmp);
	assert.strictEqual(result.status, 0);
	assert.ok(fs.existsSync(path.join(tmp, ".why-mode")));
});

test("/why-mode off removes flag and emits nothing", (tmp) => {
	fs.writeFileSync(path.join(tmp, ".why-mode"), "on");
	const result = runHook([], promptInput("/why-mode off"), tmp);
	assert.strictEqual(result.status, 0);
	assert.strictEqual(fs.existsSync(path.join(tmp, ".why-mode")), false);
	assert.strictEqual(result.stdout.trim(), "");
});

test("/why-mode:why-mode off (namespaced) removes flag", (tmp) => {
	fs.writeFileSync(path.join(tmp, ".why-mode"), "on");
	const result = runHook([], promptInput("/why-mode:why-mode off"), tmp);
	assert.strictEqual(result.status, 0);
	assert.strictEqual(fs.existsSync(path.join(tmp, ".why-mode")), false);
});

test("unrelated prompt with active flag emits additionalContext", (tmp) => {
	fs.writeFileSync(path.join(tmp, ".why-mode"), "on");
	const result = runHook([], promptInput("fix the bug"), tmp);
	assert.strictEqual(result.status, 0);
	const out = JSON.parse(result.stdout);
	assert.ok(
		out.hookSpecificOutput.additionalContext.includes("WHY MODE ACTIVE"),
	);
});

test("unrelated prompt with no flag emits nothing", (tmp) => {
	const result = runHook([], promptInput("fix the bug"), tmp);
	assert.strictEqual(result.status, 0);
	assert.strictEqual(result.stdout.trim(), "");
});

test("--session-start clears flag", (tmp) => {
	fs.writeFileSync(path.join(tmp, ".why-mode"), "on");
	const result = runHook(["--session-start"], "", tmp);
	assert.strictEqual(result.status, 0);
	assert.strictEqual(fs.existsSync(path.join(tmp, ".why-mode")), false);
});

test("--session-start no-ops when flag absent", (tmp) => {
	const result = runHook(["--session-start"], "", tmp);
	assert.strictEqual(result.status, 0);
});

// --- SessionStart statusLine auto-configure ---

console.log("\nSessionStart statusLine auto-configure\n");

function runSessionStart(claudeConfigDir, pluginRoot, extraEnv = {}) {
	return spawnSync(process.execPath, [hookScript, "--session-start"], {
		input: "",
		encoding: "utf8",
		env: {
			...process.env,
			CLAUDE_CONFIG_DIR: claudeConfigDir,
			CLAUDE_PLUGIN_ROOT: pluginRoot,
			...extraEnv,
		},
	});
}

test("--session-start writes statusLine to settings.json when absent", (tmp) => {
	// WHY: root issue — plugin.json statusLine ignored by Claude Code; only settings.json is read.
	// This test fails before the fix (no statusLine written) and passes after.
	const fakePlugin = path.join(tmp, "plugin");
	fs.mkdirSync(path.join(fakePlugin, "src"), { recursive: true });
	fs.writeFileSync(
		path.join(fakePlugin, "src", "why-mode-statusline.sh"),
		"#!/bin/bash\necho [WHY]",
	);

	const result = runSessionStart(tmp, fakePlugin);
	assert.strictEqual(result.status, 0);

	const settings = JSON.parse(
		fs.readFileSync(path.join(tmp, "settings.json"), "utf8"),
	);
	assert.ok(
		settings.statusLine,
		"statusLine should be written to settings.json",
	);
	assert.ok(
		settings.statusLine.command.includes("why-mode-statusline"),
		"command should reference why-mode-statusline.sh",
	);
});

test("--session-start chains WHY after existing statusLine", (tmp) => {
	const fakePlugin = path.join(tmp, "plugin");
	fs.mkdirSync(path.join(fakePlugin, "src"), { recursive: true });
	fs.writeFileSync(
		path.join(fakePlugin, "src", "why-mode-statusline.sh"),
		"#!/bin/bash",
	);

	fs.writeFileSync(
		path.join(tmp, "settings.json"),
		JSON.stringify(
			{
				statusLine: {
					type: "command",
					command: 'bash "/path/to/caveman-statusline.sh"',
				},
			},
			null,
			2,
		),
	);

	runSessionStart(tmp, fakePlugin);

	const settings = JSON.parse(
		fs.readFileSync(path.join(tmp, "settings.json"), "utf8"),
	);
	assert.ok(
		settings.statusLine.command.includes("caveman-statusline.sh"),
		"should preserve existing command",
	);
	assert.ok(
		settings.statusLine.command.includes("why-mode-statusline"),
		"should add WHY script",
	);
});

test("--session-start is idempotent when WHY already in statusLine", (tmp) => {
	const fakePlugin = path.join(tmp, "plugin");
	fs.mkdirSync(path.join(fakePlugin, "src"), { recursive: true });
	fs.writeFileSync(
		path.join(fakePlugin, "src", "why-mode-statusline.sh"),
		"#!/bin/bash",
	);

	const originalCmd = `bash -c 'bash "/caveman.sh"; bash "${fakePlugin}/src/why-mode-statusline.sh"'`;
	fs.writeFileSync(
		path.join(tmp, "settings.json"),
		JSON.stringify(
			{
				statusLine: { type: "command", command: originalCmd },
			},
			null,
			2,
		),
	);

	runSessionStart(tmp, fakePlugin);

	const settings = JSON.parse(
		fs.readFileSync(path.join(tmp, "settings.json"), "utf8"),
	);
	assert.strictEqual(
		settings.statusLine.command,
		originalCmd,
		"should not modify already-configured statusLine",
	);
});

test("additionalContext contains all required elements", (_tmp) => {
	assert.ok(ADDITIONAL_CONTEXT.includes("WHY"));
	assert.ok(ADDITIONAL_CONTEXT.includes("how it helps"));
	assert.ok(ADDITIONAL_CONTEXT.includes("radically different"));
	assert.ok(ADDITIONAL_CONTEXT.includes("language-appropriate"));
});

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
