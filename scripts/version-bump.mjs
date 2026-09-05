import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Increment an `A.B.C` version using the project's dev build-counter scheme:
 * the patch segment (C) is a counter running 0-99 (two-digit range, plain
 * integers); when it exceeds 99 it wraps to 0 and the minor segment (B,
 * range 0-9) increments; when minor exceeds 9 it wraps to 0 and the major
 * segment (A) increments.
 */
export function bumpVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) {
    throw new Error(`invalid version '${version}' — expected <major>.<minor>.<patch>`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  patch += 1;
  if (patch > 99) {
    patch = 0;
    minor += 1;
  }
  if (minor > 9) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function writeJson(file, data) {
  const raw = readFileSync(file, 'utf8');
  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(file, JSON.stringify(data, null, 2) + trailing);
}

function main() {
  const jsonPath = 'package.json';
  const pkg = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const current = pkg.version;
  const next = bumpVersion(current);
  pkg.version = next;
  writeJson(jsonPath, pkg);

  const lockPath = 'package-lock.json';
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  writeJson(lockPath, lock);

  console.log(`version bumped: ${current} -> ${next}`);
}

const invokedAsMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]));

if (invokedAsMain) main();