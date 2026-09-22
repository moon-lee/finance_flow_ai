import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Loaded natively via file URL (bypasses Vite's module graph, which rewrites
// relative `.mjs` imports to a Windows path Node cannot resolve).
const { localTimestamp, syncChangelog } = await import(
  pathToFileURL(join(process.cwd(), 'scripts', 'version-bump.mjs')).href
);

const NOW = '2026-09-17T01:40:00+10:00';

const FIXTURE = `---
version: 1.1.9
created: 2026-06-14
last_updated: 2026-09-16T13:20:00+10:00
---

# Changelog

## [1.1.9] - 2026-09-15

### Added

- Something shiny.

## [1.1.8] - 2026-09-15

### Fixed

- Something older.
`;

const UNRELEASED_FIXTURE = `---
version: 1.2.1
created: 2026-06-14
last_updated: 2026-09-22T11:23:08+10:00
---

# Changelog

## [Unreleased]

### Added

- Something pending.

## [1.2.1] - 2026-09-22

### Added

- Something shipped.
`;

const EMPTY_UNRELEASED_FIXTURE = `---
version: 1.2.1
created: 2026-06-14
last_updated: 2026-09-22T11:23:08+10:00
---

# Changelog

## [Unreleased]

## [1.2.1] - 2026-09-22

### Added

- Something shipped.
`;

describe('syncChangelog (AGENTS.md rule 5, step 2)', () => {
  it('syncs frontmatter version + last_updated and renames the rolling top header', () => {
    const out = syncChangelog(FIXTURE, { from: '1.1.9', to: '1.2.0', now: NOW });
    expect(out).toContain('version: 1.2.0');
    expect(out).toContain(`last_updated: ${NOW}`);
    expect(out).toContain('## [1.2.0] - 2026-09-15');
    expect(out).not.toContain('## [1.1.9]');
    expect(out).toContain('- Something shiny.');
    expect(out).toContain('## [1.1.8] - 2026-09-15');
  });

  it('leaves headers alone when the top section is not `from` (history is not rewritten)', () => {
    const out = syncChangelog(FIXTURE, { from: '1.1.8', to: '1.1.9', now: NOW });
    expect(out).toContain('version: 1.1.9');
    expect(out).toContain('## [1.1.9] - 2026-09-15');
    expect(out).toContain('## [1.1.8] - 2026-09-15');
  });

  it('is a no-op on headers when already synced', () => {
    const once = syncChangelog(FIXTURE, { from: '1.1.9', to: '1.2.0', now: NOW });
    const twice = syncChangelog(once, { from: '1.1.9', to: '1.2.0', now: NOW });
    expect(twice).toBe(once);
  });

  it('still syncs frontmatter when no version header exists', () => {
    const out = syncChangelog('# Changelog\n\nNo headers yet.\n', {
      from: '1.1.9',
      to: '1.2.0',
      now: NOW,
    });
    expect(out).toContain('No headers yet.');
  });

  it('promotes a non-empty [Unreleased] to the next version and adds a fresh one', () => {
    const out = syncChangelog(UNRELEASED_FIXTURE, { from: '1.2.1', to: '1.2.2', now: NOW });
    expect(out).toContain('version: 1.2.2');
    expect(out).toContain('## [Unreleased]\n\n## [1.2.2] - 2026-09-17');
    expect(out).toContain('- Something pending.');
    expect(out).toContain('## [1.2.1] - 2026-09-22');
    expect(out).toContain('- Something shipped.');
  });

  it('leaves an empty [Unreleased] alone (no empty version section)', () => {
    const out = syncChangelog(EMPTY_UNRELEASED_FIXTURE, { from: '1.2.1', to: '1.2.2', now: NOW });
    expect(out).toContain('version: 1.2.2');
    expect(out).not.toContain('## [1.2.2]');
    expect(out).toContain('## [Unreleased]');
  });
});

describe('localTimestamp', () => {
  it('matches the CHANGELOG convention', () => {
    expect(localTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
