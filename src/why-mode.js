#!/usr/bin/env node
// why-mode — Claude Code hook (SessionStart + UserPromptSubmit)
//
// SessionStart (--session-start): unlinks flag so mode doesn't carry across sessions
// UserPromptSubmit: detects /why-mode on|off, writes/unlinks flag, injects instruction

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.why-mode');

const ADDITIONAL_CONTEXT =
  'WHY MODE ACTIVE. For every file edit, add an inline code comment on the changed lines ' +
  'explaining: (1) WHY this change was made, (2) how it helps, and (3) if a radically different ' +
  'approach exists, why that approach was not taken instead. Use language-appropriate comment syntax.';

// Symlink-safe flag create. Presence = on, absence = off.
function safeCreateFlag(fp) {
  try {
    const flagDir = path.dirname(fp);
    fs.mkdirSync(flagDir, { recursive: true });

    let realFlagDir;
    try {
      const lstat = fs.lstatSync(flagDir);
      if (lstat.isSymbolicLink()) {
        realFlagDir = fs.realpathSync(flagDir);
        const realStat = fs.statSync(realFlagDir);
        if (!realStat.isDirectory()) return;
        if (typeof process.getuid === 'function') {
          if (realStat.uid !== process.getuid()) return;
        } else {
          const home = os.homedir();
          const normalizedReal = path.resolve(realFlagDir);
          const normalizedHome = path.resolve(home);
          if (!normalizedReal.toLowerCase().startsWith(normalizedHome.toLowerCase() + path.sep) &&
              normalizedReal.toLowerCase() !== normalizedHome.toLowerCase()) return;
        }
      } else {
        realFlagDir = flagDir;
      }
    } catch (e) { return; }

    const realFlagPath = path.join(realFlagDir, path.basename(fp));
    try {
      if (fs.lstatSync(realFlagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(realFlagDir, `.why-mode.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const openFlags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, openFlags, 0o600);
      fs.writeSync(fd, 'on');
      try { fs.fchmodSync(fd, 0o600); } catch (e) {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, realFlagPath);
  } catch (e) {}
}

// Returns true only if file exists and is a regular file (not a symlink).
function flagIsActive(fp) {
  try {
    return fs.lstatSync(fp).isFile();
  } catch (e) {
    return false;
  }
}

function safeUnlinkFlag(fp) {
  try { fs.unlinkSync(fp); } catch (e) {}
}

if (require.main === module) {
  if (process.argv.includes('--session-start')) {
    safeUnlinkFlag(flagPath);
    process.exit(0);
  }

  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const prompt = (data.prompt || '').trim();

      if (/^\/why-mode(?::[^\s]*)?\s+on\b/i.test(prompt)) {
        safeCreateFlag(flagPath);
      } else if (/^\/why-mode(?::[^\s]*)?\s+off\b/i.test(prompt)) {
        safeUnlinkFlag(flagPath);
      }

      if (flagIsActive(flagPath)) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: ADDITIONAL_CONTEXT
          }
        }));
      }
    } catch (e) {}
  });
}

module.exports = { safeCreateFlag, flagIsActive, safeUnlinkFlag, ADDITIONAL_CONTEXT };
