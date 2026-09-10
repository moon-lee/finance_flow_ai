/** Canonical hex form for per-extension theme colors. */
export const THEME_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isThemeColor(value: unknown): value is string {
  return typeof value === 'string' && THEME_COLOR_RE.test(value);
}

/** Resolve the user setting first, then the extension manifest default. */
export function resolveThemeColor(options: { setting?: unknown; manifest?: unknown }): string | undefined {
  if (options.setting !== undefined && !isThemeColor(options.setting)) {
    console.warn('[theme-color] ignoring invalid user theme color', options.setting);
  }
  if (isThemeColor(options.setting)) return options.setting;
  if (options.manifest !== undefined && !isThemeColor(options.manifest)) {
    console.warn('[theme-color] ignoring invalid manifest theme color', options.manifest);
  }
  if (isThemeColor(options.manifest)) return options.manifest;
  return undefined;
}

/** Darken a hex color by an amount between 0 and 1. */
export function darkenHex(hex: string, amount = 0.2): string {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) return hex;

  const value = parseInt(match[1], 16);
  const factor = Math.min(Math.max(1 - amount, 0), 1);
  const red = Math.floor(((value >> 16) & 0xff) * factor);
  const green = Math.floor(((value >> 8) & 0xff) * factor);
  const blue = Math.floor((value & 0xff) * factor);
  const format = (channel: number): string => channel.toString(16).padStart(2, '0');

  return `#${format(red)}${format(green)}${format(blue)}`;
}