import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bumpProject } from './version-bump.mjs';

/**
 * `npm start [-- bump]` — build + run the app, with an opt-in version bump.
 *
 * Plain `npm start` behaves exactly like the old
 * `npm run build && electron dist/main/main.js` (the version is untouched).
 * `npm start -- bump` (or `--bump` / `-bump` after the `--` separator) bumps
 * the version first using the same counter as `npm run version:bump`
 * (`package.json` + `package-lock.json` + `CHANGELOG.md` sync), so the run
 * picks up the new version.
 * NOTE: `npm start --bump` (no separator) cannot work — npm itself rejects
 * unknown `--flags` (EUNKNOWNCONFIG) before any script runs. The bare word
 * `bump` is the dash-free spelling.
 */
export function parseStartArgs(argv) {
  const args = [...argv];
  const bump =
    args.includes('--bump') || args.includes('-bump') || args.includes('bump');
  const rest = args.filter((a) => a !== '--bump' && a !== '-bump' && a !== 'bump');
  return { bump, rest };
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const { bump: wantBump, rest } = parseStartArgs(process.argv.slice(2));
  if (wantBump) {
    const { current, next } = bumpProject();
    console.log(`version bumped: ${current} -> ${next}`);
  }
  run('npm', ['run', 'build']);
  run('electron', ['dist/main/main.js', ...rest]);
}

const invokedAsMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]));

if (invokedAsMain) main();
