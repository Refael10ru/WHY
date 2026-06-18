#!/bin/bash
# comment-mode — statusline badge script for Claude Code
# Outputs a colored badge when comment mode is active.

FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.comment-mode"

# Refuse symlinks — attacker could point flag at ~/.ssh/id_rsa and
# have statusline render its bytes to terminal every keystroke.
[ -L "$FLAG" ] && exit 0
[ ! -f "$FLAG" ] && exit 0

printf '\033[38;5;35m[COMMENT]\033[0m'
