#!/usr/bin/env node

const { execSync } = require("node:child_process");

const REPO = "Refael10ru/WHY";
const PLUGIN = "why-mode";

function hasCmd(cmd) {
	try {
		execSync(
			process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`,
			{ stdio: "ignore" },
		);
		return true;
	} catch {
		return false;
	}
}

function run(cmd) {
	execSync(cmd, { stdio: "inherit" });
}

if (!hasCmd("claude")) {
	console.error(
		"Error: claude CLI not found. Install Claude Code first: https://claude.ai/code",
	);
	process.exit(1);
}

console.log("Installing why-mode for Claude Code...");

run(`claude plugin marketplace add ${REPO}`);
run(`claude plugin install ${PLUGIN}`);

console.log("\nDone! Restart Claude Code to activate.");
console.log("Usage: /why-mode on | /why-mode off");
