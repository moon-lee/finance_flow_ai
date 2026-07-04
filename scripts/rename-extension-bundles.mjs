#!/usr/bin/env node
/**
 * Post-build rename: Vite's `lib` mode (via Rolldown) names each extension
 * bundle after the entry file's basename (`main.js` for `src/main.ts`).
 * The Extension Host looks up bundles at `dist/extensions/<id>.js`, so we
 * rename each `main.js` to `<extensionId>.js` here.
 *
 * Invoked from package.json's `build:extensions` script after Vite finishes.
 *
 * Idempotent: re-running on an already-renamed directory is a no-op (no
 * file named `main.js` to rename).
 */

import { readdirSync, readFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import process from 'node:process';

const EXTENSIONS_DIR = 'extensions';
const OUT_DIR = 'dist/extensions';

function discoverEntries() {
  const extRoot = join(process.cwd(), EXTENSIONS_DIR);
  const entries = [];
  for (const name of readdirSync(extRoot)) {
    const pkgPath = join(extRoot, name, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.financeExtension) continue;
    const id = pkg.financeExtension.id ?? pkg.name;
    if (!id) continue;
    const entryRel = pkg.financeExtension.main ?? 'src/main.ts';
    const entryStem = basename(entryRel, extname(entryRel));
    entries.push({ id, entryStem });
  }
  return entries;
}

function renameInDir() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    return;
  }
  const entries = discoverEntries();
  // Sort files for deterministic iteration. On Windows NTFS and most
  // Linux filesystems, `readdirSync` already returns alphabetical order
  // (modulo inode-order on ext4), but explicit sort makes the pairing
  // below independent of OS quirks.
  const allFiles = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.js') || f.endsWith('.js.map'))
    .sort();

  // Track how many entries with the same `entryStem` we've already paired
  // so far. Vite/Rolldown emits bundles for duplicate-stem entries as
  // `main.js`, `main2.js`, `main3.js`... in entry order. The i-th entry
  // with a given stem pairs with the `main(i+1).js` / `main(i+1).js.map`
  // pair of files. (The `.js.map` sibling comes immediately after the
  // `.js` for the same entry in Vite's output, in alphabetical sort
  // order too because `'.' < '2'`.)
  const stemCount = new Map();
  const claimed = new Set();
  let renamed = 0;

  for (const entry of entries) {
    const idx = stemCount.get(entry.entryStem) ?? 0;
    stemCount.set(entry.entryStem, idx + 1);

    // `idx === 0` keeps the legacy `main.js` name; later instances get
    // the numeric suffix Vite appends (`main2.js`, `main3.js`, ...).
    const targetStem = idx === 0 ? entry.entryStem : `${entry.entryStem}${idx + 1}`;

    for (const file of allFiles) {
      if (claimed.has(file)) continue;
      let stem = file;
      if (stem.endsWith('.js.map')) stem = stem.slice(0, -'.map'.length); // `main.js` / `main2.js`
      stem = basename(stem, extname(stem));                                  // `main` / `main2`
      if (stem !== targetStem) continue;

      const targetName = file.endsWith('.js.map')
        ? `${entry.id}.js.map`
        : `${entry.id}.js`;
      if (file === targetName) {
        claimed.add(file);
        continue;
      }
      const oldPath = join(OUT_DIR, file);
      const newPath = join(OUT_DIR, targetName);
      renameSync(oldPath, newPath);
      console.log(`[rename] ${file} -> ${targetName}`);
      renamed++;
      claimed.add(targetName);
    }
  }

  if (renamed === 0) {
    console.log('[rename] no renames needed');
  }
}

renameInDir();
