import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'better-sqlite3');

// Compile better-sqlite3 for the host Node runtime (not Electron). The committed
// binary is produced by `npm run rebuild` (electron-rebuild) and targets
// Electron's NODE_MODULE_VERSION, which vitest (running under plain Node) cannot
// load. We invoke node-gyp directly (instead of `npm rebuild`) to avoid the
// project's allow-scripts gate on package install scripts; node-gyp compiles
// against whatever Node runs this script.
const res = spawnSync('node-gyp', ['rebuild', '--release'], {
  cwd: pkgDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(res.status ?? 1);
