#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: bash scripts/rename-template.sh <new-package-name> <new-display-name>"
  exit 1
fi

NEW_PACKAGE="$1"
NEW_DISPLAY="$2"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_FILES=$(rg -l "tsw-2026-march|tsw-2026-march|tsw-2026-march|tsw-2026-march")

if [ -z "$TARGET_FILES" ]; then
  echo "No template placeholders found."
  exit 0
fi

while IFS= read -r file; do
  perl -0pi -e "s/tsw-2026-march/${NEW_PACKAGE}/g; s/tsw-2026-march/${NEW_PACKAGE}/g; s/tsw-2026-march/${NEW_DISPLAY}/g; s/tsw-2026-march/${NEW_DISPLAY}/g" "$file"
done <<< "$TARGET_FILES"

echo "Template placeholders updated:"
echo "- package slug: $NEW_PACKAGE"
echo "- display name: $NEW_DISPLAY"
