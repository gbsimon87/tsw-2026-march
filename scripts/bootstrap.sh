#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

copy_if_missing() {
  local src="$1"
  local dest="$2"

  if [ ! -f "$dest" ]; then
    cp "$src" "$dest"
    echo "Created $dest from template"
  fi
}

copy_if_missing "client/.env.example" "client/.env"
copy_if_missing "server/.env.example" "server/.env"

copy_if_missing "env/client/.env.local.example" "env/client/.env.local"
copy_if_missing "env/client/.env.production.example" "env/client/.env.production"
copy_if_missing "env/server/.env.local.example" "env/server/.env.local"
copy_if_missing "env/server/.env.production.example" "env/server/.env.production"

pnpm install

echo "Bootstrap complete. Run: pnpm dev"
