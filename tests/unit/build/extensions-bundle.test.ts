/**
 * Phase 4 Task 13.3 — extension bundle build guard.
 *
 * Verifies the type-only `finance` import contract: every extension source
 * imports `FinanceApi` via `import type { FinanceApi } from 'finance'`, which
 * esbuild strips at build time. The produced bundle must therefore contain no
 * runtime reference to the `finance` module, and must stay under the 200 KB
 * sanity ceiling. Running `build:extensions` in `beforeAll` exercises the real
 * Vite pipeline used by `npm run build:extensions`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE = join(process.cwd(), 'dist', 'extensions', 'salary-history.js');

describe('extension bundle — type-only finance import (Task 13)', () => {
  beforeAll(() => {
    execSync('npm run build:extensions', { stdio: 'ignore' });
  }, 120_000);

  it('produces the salary-history bundle', () => {
    expect(() => statSync(BUNDLE)).not.toThrow();
  });

  it('contains no `from "finance"` runtime import', () => {
    const code = readFileSync(BUNDLE, 'utf8');
    expect(code).not.toMatch(/from\s*["']finance["']/);
  });

  it('contains no `require("finance")` runtime call', () => {
    const code = readFileSync(BUNDLE, 'utf8');
    expect(code).not.toMatch(/require\(\s*["']finance["']\s*\)/);
  });

  it('bundle size is under 200 KB', () => {
    const { size } = statSync(BUNDLE);
    expect(size).toBeLessThan(200 * 1024);
  });
});
