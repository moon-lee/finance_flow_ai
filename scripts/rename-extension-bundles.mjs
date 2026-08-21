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

import { readdirSync, readFileSync, renameSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import process from 'node:process';

const EXTENSIONS_DIR = 'extensions';
const OUT_DIR = 'dist/extensions';

let rootPkgName = 'finance_flow_ai';
try {
  rootPkgName = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).name ?? rootPkgName;
} catch {
  // keep default
}

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
  const pkgNameToId = new Map();
  for (const entry of entries) {
    pkgNameToId.set(entry.entryStem, entry.id);
  }
  const extRoot = join(process.cwd(), EXTENSIONS_DIR);
  for (const name of readdirSync(extRoot)) {
    const pkgPath = join(extRoot, name, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.financeExtension || !pkg.name) continue;
    const id = pkg.financeExtension.id ?? pkg.name;
    if (id && pkg.name !== id) {
      pkgNameToId.set(pkg.name, id);
    }
  }

  // Build a set of extension ids that actually import CSS files so we can
  // rename Vite's root-package-named CSS output to the correct id.
  const cssImportingIds = new Set();
  for (const name of readdirSync(extRoot)) {
    const dir = join(extRoot, name);
    const pkgPath = join(dir, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.financeExtension) continue;
    const id = pkg.financeExtension.id ?? pkg.name;
    if (!id) continue;
    // Walk src/ looking for `.css` imports.
    const srcDir = join(dir, 'src');
    if (!existsSync(srcDir)) continue;
    const hasCssImport = readdirSync(srcDir, { recursive: true })
      .some((f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.css'));
    // Walk src/ looking for `.css` imports in .ts/.js files.
    let found = false;
    function walk(d) {
      if (found) return;
      for (const entry of readdirSync(d)) {
        if (found) break;
        const full = join(d, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) {
            walk(full);
          } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
            const content = readFileSync(full, 'utf8');
            if (content.includes('.css') && (content.includes("from '") || content.includes('from "'))) {
              found = true;
            }
          }
        } catch {
          // ignore unreadable paths
        }
      }
    }
    walk(srcDir);
    if (found) cssImportingIds.add(id);
  }
  // Sort files for deterministic iteration. On Windows NTFS and most
  // Linux filesystems, `readdirSync` already returns alphabetical order
  // (modulo inode-order on ext4), but explicit sort makes the pairing
  // below independent of OS quirks.
  const allFiles = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.js') || f.endsWith('.js.map') || f.endsWith('.css'))
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
        : file.endsWith('.css')
          ? `${entry.id}.css`
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

  // Rename CSS files emitted by Vite using the package `name` rather than
  // the entry stem. Vite concatenates all CSS imported by the entry and
  // names the output after the root package name, so we map that back to
  // the extension id here.
  for (const file of allFiles) {
    if (claimed.has(file)) continue;
    if (!file.endsWith('.css')) continue;
    const stem = basename(file, extname(file));
    // Direct match: package name → extension id.
    const targetId = pkgNameToId.get(stem);
    if (targetId) {
      const targetName = `${targetId}.css`;
      if (file !== targetName) {
        renameSync(join(OUT_DIR, file), join(OUT_DIR, targetName));
        console.log(`[rename] ${file} -> ${targetName}`);
        renamed++;
        claimed.add(targetName);
      }
      continue;
    }
    // Fallback: if only one extension imports CSS, assign the root-package-
    // named CSS file to that extension.
    if (stem === rootPkgName && cssImportingIds.size === 1) {
      const targetId = [...cssImportingIds][0];
      const targetName = `${targetId}.css`;
      if (file !== targetName) {
        renameSync(join(OUT_DIR, file), join(OUT_DIR, targetName));
        console.log(`[rename] ${file} -> ${targetName}`);
        renamed++;
        claimed.add(targetName);
      }
    }
  }

  if (renamed === 0) {
    console.log('[rename] no renames needed');
  }
}

renameInDir();
