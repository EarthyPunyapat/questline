#!/usr/bin/env bash
# questline installer — symlinks the compiled binary into ~/.local/bin.
# Idempotent: safe to re-run at any time (re-links over an existing symlink).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN="$PROJECT_ROOT/dist/questline"
TARGET="${HOME}/.local/bin"
LINK="$TARGET/questline"

if [[ ! -x "$BIN" ]]; then
  echo "questline: $BIN not found or not executable." >&2
  echo "Run \`bun run build\` first, then re-run this installer." >&2
  exit 1
fi

mkdir -p "$TARGET"
ln -sfn "$BIN" "$LINK"

case ":$PATH:" in
  *":$TARGET:"*) ;;
  *)
    echo "NOTE: $TARGET is not on your PATH."
    echo "Add it to your shell profile to run \`questline\` from anywhere:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo "Installed: $LINK -> $BIN"
