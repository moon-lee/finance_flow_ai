import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Loaded natively via file URL (bypasses Vite's module graph, which rewrites
// relative `.mjs` imports to a Windows path Node cannot resolve).
const { parseStartArgs } = await import(
  pathToFileURL(join(process.cwd(), 'scripts', 'start.mjs')).href
);

describe('parseStartArgs (npm start [-- bump])', () => {
  it('no flag -> no bump, nothing forwarded', () => {
    expect(parseStartArgs([])).toEqual({ bump: false, rest: [] });
  });

  it('--bump -> bump, flag stripped', () => {
    expect(parseStartArgs(['--bump'])).toEqual({ bump: true, rest: [] });
  });

  it('-bump alias -> bump, flag stripped', () => {
    expect(parseStartArgs(['-bump'])).toEqual({ bump: true, rest: [] });
  });

  it('bare bump word -> bump, word stripped (npm rejects --bump outright)', () => {
    expect(parseStartArgs(['bump'])).toEqual({ bump: true, rest: [] });
  });

  it('forwards extra args to electron', () => {
    expect(parseStartArgs(['--bump', '--inspect'])).toEqual({ bump: true, rest: ['--inspect'] });
    expect(parseStartArgs(['--dev'])).toEqual({ bump: false, rest: ['--dev'] });
  });
});
