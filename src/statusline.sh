#!/bin/bash
# Combined statusline: runs caveman badge then why-mode badge.
# Wire up in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/src/statusline.sh\"" }

CAVEMAN_SCRIPT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/caveman-statusline.sh"
COMMENT_SCRIPT="$(dirname "$0")/why-mode-statusline.sh"

[ -f "$CAVEMAN_SCRIPT" ] && bash "$CAVEMAN_SCRIPT"
[ -f "$COMMENT_SCRIPT" ] && bash "$COMMENT_SCRIPT"
