#!/usr/bin/env node
// why-mode — Claude Code hook (SessionStart + UserPromptSubmit)
//
// SessionStart (--session-start): unlinks flag so mode doesn't carry across sessions
// UserPromptSubmit: detects /why-mode on|off, writes/unlinks flag, injects instruction

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const claudeDir =
	process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const flagPath = path.join(claudeDir, ".why-mode");

const ADDITIONAL_CONTEXT =
	"WHY MODE ACTIVE. For every file edit, add an inline code comment on the changed lines " +
	"explaining: (1) WHY this change was made, (2) how it helps, and (3) if a radically different " +
	"approach exists, why that approach was not taken instead. Use language-appropriate comment syntax.";

// WHY: extracted from safeCreateFlag to flatten nesting — resolves symlinked dirs safely,
// returns the real dir string or null if the symlink points outside user's home (attack vector).
function resolveRealDir(flagDir) {
	try {
		const lstat = fs.lstatSync(flagDir);
		if (!lstat.isSymbolicLink()) return flagDir;

		const realDir = fs.realpathSync(flagDir);
		const realStat = fs.statSync(realDir);
		if (!realStat.isDirectory()) return null;

		if (typeof process.getuid === "function")
			return realStat.uid === process.getuid() ? realDir : null;

		// WHY: Windows has no getuid; fall back to checking the path is under home dir
		const resolved = path.resolve(realDir).toLowerCase();
		const home = path.resolve(os.homedir()).toLowerCase();
		return resolved === home || resolved.startsWith(home + path.sep)
			? realDir
			: null;
	} catch (_e) {
		return null;
	}
}

// WHY: extracted from safeCreateFlag — returns false if target path is a symlink (attack),
// true if absent (safe to create), true if regular file (idempotent overwrite).
function canWriteFlag(realFlagPath) {
	try {
		return !fs.lstatSync(realFlagPath).isSymbolicLink();
	} catch (e) {
		return e.code === "ENOENT";
	}
}

// Symlink-safe flag create. Presence = on, absence = off.
function safeCreateFlag(fp) {
	try {
		const flagDir = path.dirname(fp);
		fs.mkdirSync(flagDir, { recursive: true });

		const realFlagDir = resolveRealDir(flagDir);
		if (!realFlagDir) return;

		const realFlagPath = path.join(realFlagDir, path.basename(fp));
		if (!canWriteFlag(realFlagPath)) return;

		const O_NOFOLLOW =
			typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
		const openFlags =
			fs.constants.O_WRONLY |
			fs.constants.O_CREAT |
			fs.constants.O_EXCL |
			O_NOFOLLOW;
		const tempPath = path.join(
			realFlagDir,
			`.why-mode.${process.pid}.${Date.now()}`,
		);
		let fd;
		try {
			fd = fs.openSync(tempPath, openFlags, 0o600);
			fs.writeSync(fd, "on");
			try {
				fs.fchmodSync(fd, 0o600);
			} catch (_e) {}
		} finally {
			if (fd !== undefined) fs.closeSync(fd);
		}
		fs.renameSync(tempPath, realFlagPath);
	} catch (_e) {}
}

// Returns true only if file exists and is a regular file (not a symlink).
function flagIsActive(fp) {
	try {
		return fs.lstatSync(fp).isFile();
	} catch (_e) {
		return false;
	}
}

function safeUnlinkFlag(fp) {
	try {
		fs.unlinkSync(fp);
	} catch (_e) {}
}

// WHY: extracted from session-start block to flatten nesting — cosmetic, so silently
// ignores all errors rather than risking blocking session start.
function autoConfigStatusLine(dir) {
	try {
		const settingsPath = path.join(dir, "settings.json");
		const pluginRoot =
			process.env.CLAUDE_PLUGIN_ROOT ||
			path.join(dir, "plugins", "marketplaces", "why-mode");
		const scriptPath = path.join(pluginRoot, "src", "why-mode-statusline.sh");

		let settings = {};
		try {
			settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		} catch (_e) {}

		const existing = settings.statusLine?.command || "";
		if (existing.includes("why-mode-statusline")) return;

		// WHY: chain after any existing statusLine (e.g. caveman) so other badges survive.
		settings.statusLine = existing
			? {
					type: "command",
					command: `bash -c '${existing}; bash "${scriptPath}"'`,
				}
			: { type: "command", command: `bash "${scriptPath}"` };
		fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
		process.stdout.write(
			"WHY statusline auto-configured. Run /reload-plugins (or restart Claude Code) to see the [WHY] badge.",
		);
	} catch (_e) {}
}

if (require.main === module) {
	if (process.argv.includes("--session-start")) {
		safeUnlinkFlag(flagPath);
		autoConfigStatusLine(claudeDir);
		process.exit(0);
	}

	let input = "";
	process.stdin.on("data", (chunk) => {
		input += chunk;
	});
	process.stdin.on("end", () => {
		try {
			const data = JSON.parse(input);
			const prompt = (data.prompt || "").trim();

			if (/^\/why-mode(?::[^\s]*)?\s+on\b/i.test(prompt))
				safeCreateFlag(flagPath);
			else if (/^\/why-mode(?::[^\s]*)?\s+off\b/i.test(prompt))
				safeUnlinkFlag(flagPath);

			if (!flagIsActive(flagPath)) return;

			process.stdout.write(
				JSON.stringify({
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: ADDITIONAL_CONTEXT,
					},
				}),
			);
		} catch (_e) {}
	});
}

module.exports = {
	safeCreateFlag,
	flagIsActive,
	safeUnlinkFlag,
	ADDITIONAL_CONTEXT,
};
