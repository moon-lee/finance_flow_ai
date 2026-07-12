#!/usr/bin/env bash
# One-shot better-sqlite3 ABI diagnostic.
#
# Prints the Node ABI that better-sqlite3 was compiled against and the
# ABIs of the two runtimes it might be loaded under:
#   1. System Node (drives `npm test` / vitest)
#   2. Electron's bundled Node (drives `npm start` / the running app)
#
# If either ABI matches the binary's (or the binary is N-API), it will
# load under that runtime. Otherwise run `npm test` for tests, or
# `npm run rebuild` for the running app — the `pretest` script
# (`scripts/rebuild-better-sqlite3-node.mjs`) rebuilds better-sqlite3
# against the system Node ABI automatically.
#
# Usage:
#   ./check-sqlite-abi.sh

set -euo pipefail

cd "$(dirname "$0")"

NODE_ABI=$(node -p "process.versions.modules")
NODE_NAPI=$(node -p "process.versions.napi")
NODE_VERSION=$(node -v)

BIN_PATH="node_modules/better-sqlite3/build/Release/better_sqlite3.node"

# Look up Electron's bundled Node ABI. Electron ships its own Node; the
# version-to-ABI mapping is stable per Electron major. Source:
# https://www.electronjs.org/docs/latest/tutorial/electron-timelines
# Format per line: ELECTRON_MAJOR|node_version|node_abi
ELECTRON_TABLE="28|18.18.2|108
29|20.9.0|115
30|20.9.0|115
31|20.14.0|115
32|20.18.0|115
33|20.18.1|115
34|20.18.1|115
35|22.9.0|127
36|22.14.0|127
37|22.14.0|127
38|22.14.0|127
39|22.14.0|127
40|22.14.0|127
41|22.14.0|127
42|22.14.0|127
43|22.14.0|127
44|22.15.0|127"

ELECTRON_VERSION=""
ELECTRON_NODE_ABI=""
if [ -f "node_modules/electron/package.json" ]; then
  ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version" 2>/dev/null || echo "")
  ELECTRON_MAJOR=$(echo "$ELECTRON_VERSION" | cut -d. -f1)
  if [ -n "$ELECTRON_MAJOR" ]; then
    ROW=$(echo "$ELECTRON_TABLE" | grep "^${ELECTRON_MAJOR}|" | head -1 || true)
    if [ -n "$ROW" ]; then
      ELECTRON_NODE_ABI=$(echo "$ROW" | cut -d'|' -f3)
    fi
  fi
fi

printf '%-22s %s\n' "System Node:"     "$NODE_VERSION"
printf '%-22s %s\n' "System Node ABI:" "$NODE_ABI"
printf '%-22s %s\n' "System N-API:"    "$NODE_NAPI"
if [ -n "$ELECTRON_VERSION" ]; then
  printf '%-22s %s\n' "Electron:"        "$ELECTRON_VERSION"
  printf '%-22s %s\n' "Electron Node ABI:" "${ELECTRON_NODE_ABI:-<unknown for this version>}"
fi

if [ ! -f "$BIN_PATH" ]; then
  echo ""
  printf '%-22s %s\n' "better-sqlite3:"  "<binary not found at $BIN_PATH>"
  echo ""
  echo "STATUS: better-sqlite3 binary is missing. Run 'npm install' to trigger"
  echo "        the 'postinstall' step ('electron-rebuild --force')."
  exit 0
fi

# Try to extract the legacy NODE_MODULE_VERSION string (older better-sqlite3
# versions embedded it directly in the .node binary).
BIN_ABI=$(grep -ao 'NODE_MODULE_VERSION [0-9]*' "$BIN_PATH" 2>/dev/null | head -1 | awk '{print $2}' || true)

BIN_MTIME=$(stat -c '%y' "$BIN_PATH" 2>/dev/null || stat -f '%Sm' "$BIN_PATH" 2>/dev/null || echo "unknown")

printf '%-22s %s\n' "better-sqlite3:"  "${BIN_ABI:-<N-API binary, see mtime>}"
printf '%-22s %s\n' "binary built:"    "$BIN_MTIME"

echo ""
if [ -n "$BIN_ABI" ]; then
  # Legacy binary — strict ABI matching required.
  MATCHES_SYSTEM=""
  MATCHES_ELECTRON=""
  [ "$BIN_ABI" = "$NODE_ABI" ] && MATCHES_SYSTEM="YES"
  [ -n "$ELECTRON_NODE_ABI" ] && [ "$BIN_ABI" = "$ELECTRON_NODE_ABI" ] && MATCHES_ELECTRON="YES"
  if [ -n "$MATCHES_SYSTEM" ] || [ -n "$MATCHES_ELECTRON" ]; then
    echo "STATUS: ABI match (system=${MATCHES_SYSTEM:-no}, electron=${MATCHES_ELECTRON:-no}) —"
    echo "        binary will load under the matching runtime(s)."
  else
    echo "STATUS: ABI MISMATCH for both runtimes — run 'npm test' (rebuilds for system"
    echo "        Node via 'pretest') or 'npm run rebuild' (rebuilds for Electron's Node)."
  fi
else
  # N-API binary — ABI-agnostic, should work on any Node with a compatible
  # N-API version. Just check the binary exists.
  echo "STATUS: N-API build detected — better-sqlite3 v12+ uses a stable N-API"
  echo "        ABI that works across Node versions. If 'npm test' fails, run"
  echo "        it once to trigger the 'pretest' rebuild against your system Node."
fi
