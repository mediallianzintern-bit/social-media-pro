#!/usr/bin/env bash
# Uploads every variable in .env to the linked Vercel project.
#
# Values are piped to the Vercel CLI on stdin, never passed as arguments and
# never printed — so nothing sensitive appears on screen, in `ps`, or in shell
# history. Only variable NAMES are shown.
#
# Prerequisites (both interactive, run them yourself first):
#   npx vercel login
#   npx vercel link          # pick the social-media-pro project
#
# Usage:
#   bash scripts/vercel-env-push.sh            # production + preview + development
#   bash scripts/vercel-env-push.sh production # one environment only
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found in $(pwd)" >&2
  exit 1
fi
if [ ! -d .vercel ]; then
  echo "This project isn't linked to Vercel yet. Run:  npx vercel link" >&2
  exit 1
fi

ENVIRONMENTS=("${1:-}")
if [ -z "${ENVIRONMENTS[0]}" ]; then
  ENVIRONMENTS=(production preview development)
fi

added=0
failed=0

while IFS= read -r line || [ -n "$line" ]; do
  # Skip blanks and comments.
  case "$line" in ''|'#'*) continue ;; esac
  # Split on the FIRST "=" only: values legitimately contain "=".
  name=${line%%=*}
  value=${line#*=}
  # Ignore anything that isn't a plain NAME=value line.
  case "$name" in *[!A-Za-z0-9_]*|'') continue ;; esac
  # Strip one layer of surrounding quotes, if present.
  value=${value%$'\r'}
  if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
    value=${value#\"}; value=${value%\"}
  elif [ "${value#\'}" != "$value" ] && [ "${value%\'}" != "$value" ]; then
    value=${value#\'}; value=${value%\'}
  fi
  [ -z "$value" ] && { echo "skip  $name (empty)"; continue; }

  for target in "${ENVIRONMENTS[@]}"; do
    # printf, not echo: no trailing newline gets stored inside the value.
    if printf '%s' "$value" | npx --yes vercel env add "$name" "$target" >/dev/null 2>&1; then
      echo "ok    $name -> $target"
      added=$((added + 1))
    else
      echo "FAIL  $name -> $target (already set? remove it first: npx vercel env rm $name $target)"
      failed=$((failed + 1))
    fi
  done
done < .env

echo
echo "added $added, failed $failed"
echo "Remember to also add AUTO_SYNC=off, which is not in your local .env:"
echo "  printf 'off' | npx vercel env add AUTO_SYNC production"
