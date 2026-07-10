#!/usr/bin/env bash
# Fix better-sqlite3 native module ABI mismatch.
#
# Problem: the .node binary was compiled for one Node ABI (e.g. Electron's)
# but `vitest` runs under the system Node, which expects a different ABI.
# This script rebuilds better-sqlite3 against the Node version that runs
# `npm test` / `npx vitest`.
#
# Usage:
#   chmod +x fix-sqlite-abi.sh
#   ./fix-sqlite-abi.sh

set -euo pipefail

cd "$(dirname "$0")"

CURRENT_NODE_VERSION=$(node -v | sed 's/^v//')
CURRENT_NODE_ABI=$(node -p "process.versions.modules")

echo "System Node version: $CURRENT_NODE_VERSION"
echo "System Node ABI:     $CURRENT_NODE_ABI"

# Show the ABI of the currently installed binary
if [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
  # Strings isn't perfect but usually shows NODE_MODULE_VERSION in the binary
  echo ""
  echo "Current better-sqlite3 binary ABI:"
  strings node_modules/better-sqlite3/build/Release/better_sqlite3.node | grep -o 'NODE_MODULE_VERSION [0-9]*' || true
fi

echo ""
echo "Rebuilding better-sqlite3 for system Node $CURRENT_NODE_VERSION (ABI $CURRENT_NODE_ABI)..."

# Clean any stale build artifacts
rm -rf node_modules/better-sqlite3/build

# Rebuild against the system Node runtime
npm rebuild better-sqlite3 \
  --runtime=node \
  --target="$CURRENT_NODE_VERSION" \
  --arch=x64 \
  --dist-url=https://nodejs.org/download/release

echo ""
echo "Verifying ABI match..."
INSTALLED_ABI=$(node -e "console.log(require('better-sqlite3').constructor.name)" 2>/dev/null || echo "FAILED")

if [ "$INSTALLED_ABI" = "FAILED" ]; then
  echo "ERROR: better-sqlite3 still cannot load."
  echo ""
  echo "Common fixes:"
  echo "  1. Ensure you have Python 3 and a C++ compiler installed:"
  echo "       sudo apt install python3 g++ make"
  echo "  2. Try a full reinstall:"
  echo "       rm -rf node_modules/better-sqlite3"
  echo "       npm install better-sqlite3"
  echo "  3. If using nvm, make sure the same Node version runs rebuild and tests:"
  echo "       nvm use <version>"
  exit 1
fi

echo "OK: better-sqlite3 loaded successfully under Node $CURRENT_NODE_VERSION (ABI $CURRENT_NODE_ABI)."
echo ""
echo "Run the DB tests with:"
echo "  npx vitest run tests/unit/services/database-service.test.ts"
