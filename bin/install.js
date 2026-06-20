#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = 'Refael10ru/WHY';
const PLUGIN = 'why-mode';
const MARKER = '# why-mode-statusline-generated';

function hasCmd(cmd) {
  try {
    execSync(
      process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function readSettings() {
  const p = path.join(claudeDir(), 'settings.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function writeSettings(data) {
  const p = path.join(claudeDir(), 'settings.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 4) + '\n');
}

function installStatusLine() {
  const settings = readSettings();
  const hooksDir = path.join(claudeDir(), 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  const combinedPath = path.join(hooksDir, 'why-mode-statusline.sh');
  const prevCmd = settings.statusLine?.command || '';

  // Don't double-wrap if we already generated this script
  const alreadyWrapped = prevCmd.includes('why-mode-statusline.sh');

  const prevSection = prevCmd && !alreadyWrapped
    ? `# previous statusline\n${prevCmd}\n`
    : '';

  const script = `#!/usr/bin/env bash
${MARKER}
${prevSection}
# why-mode badge
FLAG="\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/.why-mode"
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0
printf ' \\033[38;5;35m[WHY]\\033[0m'
`;

  fs.writeFileSync(combinedPath, script, { mode: 0o755 });

  if (!alreadyWrapped) {
    settings.statusLine = {
      type: 'command',
      command: `bash "${combinedPath}"`,
    };
    writeSettings(settings);
  }
}

if (!hasCmd('claude')) {
  console.error('Error: claude CLI not found. Install Claude Code first: https://claude.ai/code');
  process.exit(1);
}

console.log('Installing why-mode for Claude Code...');

run(`claude plugin marketplace add ${REPO}`);
run(`claude plugin install ${PLUGIN}`);
installStatusLine();

console.log('\nDone! Restart Claude Code to activate.');
console.log('Usage: /why-mode on | /why-mode off');
