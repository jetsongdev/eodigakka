#!/bin/sh
set -eu

payload="$(cat)"

cwd="$(
  PAYLOAD="$payload" python3 - <<'PY'
import json
import os

try:
    data = json.loads(os.environ.get("PAYLOAD", "{}") or "{}")
except json.JSONDecodeError:
    data = {}

print(data.get("cwd") or os.getcwd())
PY
)"

case "$cwd" in
  */.claude/worktrees/*) ;;
  *) exit 0 ;;
esac

repo_root="${cwd%%/.claude/worktrees/*}"
source_env="$repo_root/web/.env.local"
target_env="$cwd/web/.env.local"

if [ ! -f "$source_env" ]; then
  echo "worktree env symlink skipped: source missing at $source_env"
  exit 0
fi

if [ -L "$target_env" ]; then
  current_target="$(readlink "$target_env")"
  if [ "$current_target" = "$source_env" ]; then
    exit 0
  fi
  echo "worktree env symlink skipped: $target_env points to $current_target"
  exit 0
fi

if [ -e "$target_env" ]; then
  echo "worktree env symlink skipped: $target_env already exists"
  exit 0
fi

mkdir -p "$(dirname "$target_env")"
ln -s "$source_env" "$target_env"
echo "worktree env symlink created: $target_env -> $source_env"
