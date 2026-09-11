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

/**
 * Convert a `#RRGGBB` theme color to a soft translucent `rgba()` tint for
 * Activity Bar active backgrounds only. Tabs and panel accents keep the
 * solid hex. Falls back to the input when malformed.
 */
export function hexToRgba(hex: string, alpha = 0.25): string {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  const clamped = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${red}, ${green}, ${blue}, ${clamped})`;
}

/**
 * Mix a `#RRGGBB` theme color toward white for the Activity Bar active
 * background only (e.g. `0.65` = 65% white, 35% color). Returns a solid
 * hex so the active button reads as a light whitish tint that is still
 * clearly colored. Tabs and panel accents keep the solid theme hex.
 * Falls back to the input when malformed.
 */
export function mixWithWhite(hex: string, whiteAmount = 0.65): string {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) return hex;
  const clamped = Math.min(Math.max(whiteAmount, 0), 1);
  const value = parseInt(match[1], 16);
  const red = Math.round(((value >> 16) & 0xff) * (1 - clamped) + 255 * clamped);
  const green = Math.round(((value >> 8) & 0xff) * (1 - clamped) + 255 * clamped);
  const blue = Math.round((value & 0xff) * (1 - clamped) + 255 * clamped);
  const format = (channel: number): string => channel.toString(16).padStart(2, '0');

  return `#${format(red)}${format(green)}${format(blue)}`;
}