#!/usr/bin/env node
// why-check — Claude Code PreToolUse hook
//
// Blocks Edit/Write tool calls that contain no inline comment when
// why-mode flag is active. Exit 2 = block. Exit 0 = pass through.

const { flagIsActive } = require('./why-mode'); // WHY: reuse flag-reading logic from why-mode.js rather than duplicating it; keeps the single-file flag contract in one place
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'); // WHY: same env-var override as why-mode.js so both scripts see the same flag under test
const flagPath = path.join(claudeDir, '.why-mode');

// WHY: language-agnostic token scan — no external deps, bar is presence of any comment token
const COMMENT_TOKENS = ['//', '#', '/*', '--', '<!--'];

// WHY: JSON and similar formats have no comment syntax; blocking edits is a false positive
const COMMENT_EXEMPT_EXTENSIONS = new Set(['.json', '.jsonl', '.lock']);

function hasCommentSyntax(content) {
  return COMMENT_TOKENS.some(token => content.includes(token));
}

function isCommentExempt(filePath) {
  return COMMENT_EXEMPT_EXTENSIONS.has(path.extname(filePath || '').toLowerCase());
}

// WHY: extracted from stdin handler to reduce nesting — returns exit code so caller stays flat
function checkEdit(input) {
  if (!flagIsActive(flagPath)) return 0; // WHY: fast-path when mode is off — near-zero overhead

  const data = JSON.parse(input);
  const toolName = data.tool_name || '';
  if (toolName !== 'Edit' && toolName !== 'Write') return 0; // WHY: only file-mutation tools need enforcement

  const ti = data.tool_input || {};
  const filePath = ti.file_path || ti.path || ''; // WHY: Claude Code uses file_path; fall back to path for test compat
  if (isCommentExempt(filePath)) return 0;

  const content = toolName === 'Edit' ? (ti.new_string || '') : (ti.content || ''); // WHY: Edit → new_string, Write → content
  if (!content.trim()) return 0; // WHY: empty edits have nothing to comment on

  if (hasCommentSyntax(content)) return 0;

  process.stderr.write(
    '[why-mode] Edit blocked: no inline WHY comment found. ' +
    'Retry with a comment explaining why this change was made.\n'
  );
  return 2; // WHY: exit 2 is the Claude Code PreToolUse convention for blocking a tool call
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      process.exit(checkEdit(input));
    } catch (e) {
      process.exit(0); // WHY: fail open on any error so the hook never breaks non-why-mode sessions
    }
  });
}

module.exports = { hasCommentSyntax };
