import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Increment an `A.B.C` version using the project's dev build-counter scheme:
 * the patch segment (C) is a counter running 0-99 (two-digit range, plain
 * integers); when it exceeds 9 it wraps to 0 and the minor segment (B,
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
  if (patch > 9) {
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

/** `YYYY-MM-DDTHH:mm:ss±HH:MM` in local time (matches the CHANGELOG convention). */
export function localTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sync a CHANGELOG.md document with a version bump (AGENTS.md rule 5, step 2):
 * frontmatter `version` + `last_updated` always follow the new version, and
 * the rolling top `## [from]` header is renamed to `## [to]` (date suffix
 * preserved). Headers are left alone when the top section is not `from`
 * (already synced, or history that must not be rewritten) — pure function,
 * never throws on unexpected shapes (patterns simply don't match).
 */
export function syncChangelog(content, { from, to, now }) {
  let out = String(content);

  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(out);
  if (fm) {
    const block = fm[1]
      .replace(/^version:\s*\S+/m, `version: ${to}`)
      .replace(/^last_updated:\s*\S+/m, `last_updated: ${now}`);
    out = out.slice(0, fm.index) + '---\n' + block + '\n---' + out.slice(fm.index + fm[0].length);
  }

  const firstHeader = /^## \[(.+?)\]/m.exec(out);
  if (firstHeader && firstHeader[1] === from) {
    out = out.replace(
      new RegExp(`^(## \\[)${escapeRegExp(from)}(\\])`, 'm'),
      `$1${to}$2`
    );
  }
  return out;
}

/**
 * Bump the project version everywhere it lives: `package.json`,
 * `package-lock.json`, and (best-effort) `CHANGELOG.md`. Shared by the
 * `version:bump` CLI and `scripts/start.mjs -- bump` so both paths behave
 * identically. A version bump never fails because of the changelog — sync
 * problems degrade to a warning.
 */
export function bumpProject() {
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

  try {
    const changelogPath = 'CHANGELOG.md';
    writeFileSync(
      changelogPath,
      syncChangelog(readFileSync(changelogPath, 'utf8'), {
        from: current,
        to: next,
        now: localTimestamp(),
      })
    );
  } catch (err) {
    console.warn(
      `[version-bump] CHANGELOG.md not synced: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { current, next };
}

function main() {
  const { current, next } = bumpProject();
  console.log(`version bumped: ${current} -> ${next}`);
}

const invokedAsMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]));

if (invokedAsMain) main();