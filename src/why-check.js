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

// WHY: language-agnostic token scan instead of a per-language AST parser because
// no external deps are allowed and the bar is presence of *any* comment, not structural validity;
// AST-based validation is tracked as a future TODO in the spec.
const COMMENT_TOKENS = ['//', '#', '/*', '--', '<!--'];

// WHY: JSON and similar formats have no comment syntax at all; blocking edits to these
// files is a false positive — the spec requires comments where the language supports them.
const COMMENT_EXEMPT_EXTENSIONS = new Set(['.json', '.jsonl', '.lock']);

function hasCommentSyntax(content) {
  return COMMENT_TOKENS.some(token => content.includes(token));
}

function isCommentExempt(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return COMMENT_EXEMPT_EXTENSIONS.has(ext);
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      if (!flagIsActive(flagPath)) process.exit(0); // WHY: fast-path exit when mode is off so the hook adds near-zero overhead in normal sessions

      const data = JSON.parse(input);
      const toolName = data.tool_name || '';

      if (toolName !== 'Edit' && toolName !== 'Write') process.exit(0); // WHY: only file-mutation tools need comment enforcement; Bash/Read/etc. are irrelevant

      const ti = data.tool_input || {};
      // WHY: Claude Code uses file_path for both Edit and Write; fall back to path for test compat
      const filePath = ti.file_path || ti.path || '';
      if (isCommentExempt(filePath)) process.exit(0); // WHY: JSON/lock files have no comment syntax; enforcing WHY comments would be impossible
      // WHY: Edit carries new_string (the replacement text), Write carries content (the full file body)
      const content = toolName === 'Edit' ? (ti.new_string || '') : (ti.content || '');

      if (!content.trim()) process.exit(0); // WHY: empty/whitespace-only edits have nothing to comment on; blocking them would just confuse Claude

      if (hasCommentSyntax(content)) process.exit(0);

      process.stderr.write(
        '[why-mode] Edit blocked: no inline WHY comment found. ' +
        'Retry with a comment explaining why this change was made.\n'
      );
      process.exit(2); // WHY: exit 2 is the Claude Code PreToolUse convention for blocking a tool call
    } catch (e) {
      process.exit(0); // WHY: fail open on any error (parse failure, fs error) so the hook never breaks non-why-mode sessions
    }
  });
}

module.exports = { hasCommentSyntax };
