/**
 * Shared Activity Bar icon asset contract (icons plan Task 1/2/5).
 *
 * A view `icon` is either a legacy one/two-character glyph (rendered as
 * text) or a relative `.svg`/`.png` asset path inside the extension package
 * (rendered as an `<img>` at 28px). Asset paths must be relative, must not
 * contain `..` traversal, and must end in `.svg` or `.png`. Absolute paths,
 * protocol URLs, query strings, and other extensions are rejected.
 *
 * This module is pure (no Electron/Node imports) so it can be shared by the
 * Zod schema (Main/Host), the renderer URL helper, and the protocol handler.
 */

/** Valid relative icon asset path, e.g. `assets/icon.svg`. */
export const ICON_ASSET_PATH_RE =
  /^(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:svg|png)$/;

export function isIconAssetPath(value: unknown): value is string {
  return typeof value === 'string' && ICON_ASSET_PATH_RE.test(value);
}

/**
 * Build the renderer-safe `finance-shell://` URL for an extension icon asset.
 * Returns `undefined` for legacy glyphs and unsafe values (caller renders text).
 */
export function buildExtensionIconUrl(
  extensionId: string,
  icon: string
): string | undefined {
  if (!isIconAssetPath(icon)) return undefined;
  return `finance-shell://extensions/${encodeURIComponent(extensionId)}/${icon
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
