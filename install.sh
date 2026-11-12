#!/usr/bin/env bash
# Install or update the hill-climb skill for Claude Code and Codex.
# Run from anywhere: ./install.sh. Re-run it after editing or pulling changes.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for DEST in "$HOME/.claude/skills/hill-climb" "$HOME/.codex/skills/hill-climb"; do
  if [ "$SRC" = "$DEST" ]; then
    echo "skip   $DEST (this is the source)"
    continue
  fi
  mkdir -p "$DEST"
  rsync -a --delete --exclude .git --exclude .DS_Store "$SRC/" "$DEST/"
  echo "ok     $DEST"
done

command -v bun >/dev/null || echo "needs  bun for scripts/hc.ts: curl -fsSL https://bun.sh/install | bash"
command -v claude >/dev/null && command -v codex >/dev/null ||
  echo "note   judges must come from two model families. Having both the claude and codex CLIs is one way to get that."
echo "done. Restart open Claude Code and Codex sessions to pick it up."
