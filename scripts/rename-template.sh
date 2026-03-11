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

TARGET_FILES=$(rg -l "mern-render-template|mern-template|MERN Render Template|MERN Template")

if [ -z "$TARGET_FILES" ]; then
  echo "No template placeholders found."
  exit 0
fi

while IFS= read -r file; do
  perl -0pi -e "s/mern-render-template/${NEW_PACKAGE}/g; s/mern-template/${NEW_PACKAGE}/g; s/MERN Render Template/${NEW_DISPLAY}/g; s/MERN Template/${NEW_DISPLAY}/g" "$file"
done <<< "$TARGET_FILES"

echo "Template placeholders updated:"
echo "- package slug: $NEW_PACKAGE"
echo "- display name: $NEW_DISPLAY"
