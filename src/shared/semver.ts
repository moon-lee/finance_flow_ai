/** Lightweight semver helpers for the Extension Manager (no dependency). */
export type Semver = readonly [number, number, number];

export function parseVersion(raw: string): Semver {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw.trim());
  if (!m) throw new Error(`invalid semver: "${raw}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [a1, a2, a3] = parseVersion(a);
  const [b1, b2, b3] = parseVersion(b);
  for (const [x, y] of [[a1, b1], [a2, b2], [a3, b3]] as const) {
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Supports exact ("1.2.3") and caret ("^1.2.0") requirements. */
export function satisfiesRequirement(installed: string, required: string): boolean {
  const req = required.trim();
  if (req.startsWith('^')) {
    const want = parseVersion(req.slice(1));
    const have = parseVersion(installed);
    if (have[0] !== want[0]) return false;
    if (have[1] > want[1]) return true;
    if (have[1] === want[1] && have[2] >= want[2]) return true;
    return false;
  }
  return compareVersions(installed, req) === 0;
}
