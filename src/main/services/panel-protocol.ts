/**
 * Phase 5 Stage 3 Task 2.1 — custom `finance-shell://` protocol handler.
 *
 * Serves three kinds of resources:
 *
 *   1. `finance-shell://panel/<extensionId>/<viewId>.html`
 *      The HTML shell that bootstraps one WebviewPanel. The protocol handler
 *      injects the `extensionId` into the template (in place of the
 *      `{{EXTENSION_ID}}` placeholder) so the panel HTML knows which bundle
 *      to load. The template also declares a strict CSP that closes the
 *      Phase 4 `'unsafe-eval'` regression.
 *
 *   2. `finance-shell://panel/<extensionId>/bootstrap.js`
 *      The panel bootstrap script. It runs in the panel renderer process,
 *      subscribes to `panel:init` (using cached payload if the event already
 *      fired before the module script executed), dynamically imports the
 *      extension bundle, calls `registerUIComponents()`, and mounts the
 *      component into `#app`.
 *
 *   3. `finance-shell://extensions/<extensionId>.js`
 *      The extension's Vite-built ESM bundle. Main resolves the absolute
 *      `file://` path under `dist/extensions/` and streams the bytes.
 *
 *   4. `finance-shell://extensions/<extensionId>.css`
 *      The extension's emitted stylesheet (tokens + layout). Served with
 *      `text/css` so the panel bootstrap can inject it as a `<link>` before
 *      loading the JS bundle, ensuring `:root` custom properties are defined
 *      before any component renders.
 *
 * All other paths return 404.
 */

import { protocol } from 'electron';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getLogger } from './logger';
import { resolveExtensionBundlePath } from '../../shared/extension-paths';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_EXTENSIONS_DIR = join(__dirname, '..', 'extensions');
const PROD_EXTENSIONS_DIR = join(process.resourcesPath, 'dist', 'extensions');
const DIST_EXTENSIONS_DIR = existsSync(PROD_EXTENSIONS_DIR) ? PROD_EXTENSIONS_DIR : DEV_EXTENSIONS_DIR;
const PANEL_TEMPLATE_PATH = join(__dirname, '..', 'resources', 'panel-template.html');
const PANEL_BOOTSTRAP_PATH = join(__dirname, '..', 'resources', 'panel-bootstrap.js');

/**
 * Register `finance-shell://` as a custom Electron protocol handler.
 *
 * The scheme must be registered as privileged (with `standard: true` and
 * `supportFetchAPI: true`) in main.ts via `protocol.registerSchemesAsPrivileged`
 * before `app.whenReady()`. This function registers the request handler.
 *
 * Serves three kinds of resources:
 */
export function registerPanelProtocol(userExtensionsRoot = ''): void {
  getLogger().log('[panel-protocol] registering finance-shell protocol handler');
  protocol.handle('finance-shell', async (request) => {
    const url = new URL(request.url);
    const pathname = url.host ? `/${url.host}${url.pathname}` : url.pathname;

    if (pathname.startsWith('/panel/') && pathname.endsWith('/bootstrap.js')) {
      return servePanelBootstrap();
    }
    if (pathname.startsWith('/panel/')) {
      return servePanelShell(pathname.slice('/panel/'.length));
    }
    if (pathname.startsWith('/extensions/')) {
      const extPath = pathname.slice('/extensions/'.length);
      // Try direct file lookup for code-split chunks (e.g. ui-*.js) first — scan user dirs
      const candidates: string[] = [];
      if (userExtensionsRoot && existsSync(userExtensionsRoot)) {
        try {
          for (const dir of readdirSync(userExtensionsRoot)) {
            candidates.push(join(userExtensionsRoot, dir, extPath));
            candidates.push(join(userExtensionsRoot, dir, extPath.split('/').pop() ?? ''));
          }
        } catch (err) {
          getLogger().warn('[panel-protocol] readdir failed', err as Error);
        }
        candidates.push(join(userExtensionsRoot, extPath));
      }
      candidates.push(join(DIST_EXTENSIONS_DIR, extPath));
      for (const cand of candidates) {
        if (cand && existsSync(cand)) {
          try {
            const data = await readFile(cand);
            const isCss = cand.endsWith('.css');
            return new Response(data, {
              status: 200,
              headers: {
                'Content-Type': isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache'
              }
            });
          } catch (err) {
            getLogger().warn('[panel-protocol] read failed for ' + cand, err as Error);
          }
        }
      }
      if (extPath.endsWith('.css')) {
        return serveExtensionCss(extPath, userExtensionsRoot);
      }
      return serveExtensionBundle(extPath, userExtensionsRoot);
    }
    getLogger().warn('[panel-protocol] 404 for', pathname);
    return new Response('Not Found', { status: 404 });
  });
}

/**
 * Serve the panel HTML shell for `/panel/<extensionId>/<viewId>.html`.
 *
 * Injects the extension id directly into the template so the shell knows
 * which bundle to bootstrap without any client-side routing logic.
 */
async function servePanelShell(path: string): Promise<Response> {
  // path is `<extensionId>/<viewId>.html`; we don't need viewId for the
  // shell content, but we validate the shape.
  const segments = path.split('/');
  if (segments.length < 2 || !segments[0] || !segments[1].endsWith('.html')) {
    return new Response('Invalid panel path', { status: 400 });
  }
  const extensionId = decodeURIComponent(segments[0]);

  let html: string;
  try {
    html = await readFile(PANEL_TEMPLATE_PATH, 'utf-8');
  } catch (err) {
    getLogger().warn('[panel-protocol] panel template not found', err as Error);
    return new Response('Panel template not found', { status: 500 });
  }

  html = html.replace('{{EXTENSION_ID}}', extensionId);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Strict CSP: no `'unsafe-eval'` (closes Phase 4 CSP regression),
      // only same-origin scripts (the bundle and bootstrap are fetched
      // from this same protocol origin), no inline scripts except the
      // CSP-nonce we don't generate because the panel template has no
      // inline handlers.
      'Content-Security-Policy':
        "default-src 'none' ; " +
        "script-src 'self' finance-shell:; " +
        "script-src-elem 'self' finance-shell:; " +
        "style-src 'self' 'unsafe-inline' finance-shell:; " +
        "img-src 'self' data: finance-shell:; " +
        "font-src 'self' finance-shell:; " +
        "connect-src 'self' finance-shell:; ",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    }
  });
}

/**
 * Serve the panel bootstrap script at `/panel/<extensionId>/bootstrap.js`.
 * This script runs in the panel's renderer process, subscribes to `panel:init`
 * (using the cached payload if the event already fired), dynamically imports
 * the extension bundle, registers components, and mounts the view into `#app`.
 */
async function servePanelBootstrap(): Promise<Response> {
  try {
    const data = await readFile(PANEL_BOOTSTRAP_PATH, 'utf-8');
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    getLogger().warn('[panel-protocol] bootstrap not found', err as Error);
    return new Response('Panel bootstrap not found', { status: 404 });
  }
}

/**
 * Serve the raw ESM bundle for `/extensions/<extensionId>.js`.
 *
 * Main resolves `<extensionId>.js` relative to `dist/extensions/`. The
 * extension bundle is produced by `vite.extensions.config.ts` and renamed
 * by `scripts/rename-extension-bundles.mjs` so the filename matches the
 * manifest id exactly.
 */
async function serveExtensionBundle(path: string, userExtensionsRoot = ''): Promise<Response> {
  if (path.endsWith('/') || path.includes('/')) {
    return new Response('Not Found', { status: 404 });
  }
  const filename = decodeURIComponent(path);
  const id = filename.replace(/\.js$/, '');
  const roots = userExtensionsRoot ? [userExtensionsRoot, DIST_EXTENSIONS_DIR] : [DIST_EXTENSIONS_DIR];
  const resolved = resolveExtensionBundlePath(id, roots);
  const absolutePath = resolved ?? join(DIST_EXTENSIONS_DIR, filename);

  try {
    const data = await readFile(absolutePath);
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err) {
    getLogger().warn(`[panel-protocol] bundle not found for ${path}, tried ${absolutePath}, roots: ${roots.join(', ')}`, err as Error);
    return new Response('Extension bundle not found', { status: 404 });
  }
}

/**
 * Serve the extension stylesheet for `/extensions/<extensionId>.css`.
 *
 * The CSS file is emitted by Vite alongside the JS bundle and renamed by
 * `scripts/rename-extension-bundles.mjs` to match the manifest id. It contains
 * the `:root` custom property definitions (design tokens) so the panel can
 * inject it before the JS bundle loads.
 *
 * Because multiple extensions may share the same token definitions, the
 * request falls back to the root-package-named CSS file when a per-extension
 * stylesheet does not exist.
 */
async function serveExtensionCss(path: string, userExtensionsRoot = ''): Promise<Response> {
  if (path.endsWith('/') || path.includes('/')) {
    return new Response('Not Found', { status: 404 });
  }
  const filename = decodeURIComponent(path);
  const roots = userExtensionsRoot ? [userExtensionsRoot, DIST_EXTENSIONS_DIR] : [DIST_EXTENSIONS_DIR];
  let absolutePath: string | null = null;
  for (const root of roots) {
    const cand = join(root, filename);
    if (existsSync(cand)) { absolutePath = cand; break; }
    try {
      for (const dir of readdirSync(root)) {
        const sub = join(root, dir, filename);
        if (existsSync(sub)) { absolutePath = sub; break; }
      }
    } catch (err) {
      getLogger().warn('[panel-protocol] readdir sub failed for ' + root, err as Error);
    }
    if (absolutePath) break;
  }
  absolutePath = absolutePath ?? join(DIST_EXTENSIONS_DIR, filename);

  try {
    const data = await readFile(absolutePath);
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err) {
    getLogger().warn('[panel-protocol] stylesheet not found for ' + absolutePath, err as Error);
    return new Response('Extension stylesheet not found', { status: 404 });
  }
}