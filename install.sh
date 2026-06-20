#!/usr/bin/env bash
set -e

REPO="Refael10ru/WHY"
PLUGIN="why-mode"

if ! command -v claude &>/dev/null; then
  echo "Error: claude CLI not found. Install Claude Code first." >&2
  exit 1
fi

claude plugin marketplace add "$REPO"
claude plugin install "$PLUGIN"

echo ""
echo "why-mode installed. Restart Claude Code to activate."
echo "Usage: /why-mode on | /why-mode off"
