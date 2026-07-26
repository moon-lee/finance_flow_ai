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
 * All other paths return 404.
 */

import { protocol } from 'electron';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_EXTENSIONS_DIR = join(__dirname, '..', 'extensions');
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
export function registerPanelProtocol(): void {
  protocol.handle('finance-shell', async (request) => {
    const url = new URL(request.url);

    // Custom protocols (finance-shell://) parse the first path segment
    // as the host/authority, stripping it from pathname:
    //   finance-shell://panel/my-ext/bootstrap.js  → host='panel', pathname='/my-ext/bootstrap.js'
    //   finance-shell://panel/my-ext/my-view.html   → host='panel', pathname='/my-ext/my-view.html'
    // Reconstruct the logical path by joining host + pathname.
    const pathname = url.host ? `/${url.host}${url.pathname}` : url.pathname;

    if (pathname.startsWith('/panel/') && pathname.endsWith('/bootstrap.js')) {
      return servePanelBootstrap();
    }
    if (pathname.startsWith('/panel/')) {
      return servePanelShell(pathname.slice('/panel/'.length));
    }
    if (pathname.startsWith('/extensions/')) {
      return serveExtensionBundle(pathname.slice('/extensions/'.length));
    }
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
  } catch {
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
    console.log("[protocol] serving bootstrap.js");
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
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
async function serveExtensionBundle(path: string): Promise<Response> {
  if (path.endsWith('/') || path.includes('/')) {
    return new Response('Not Found', { status: 404 });
  }
  const filename = decodeURIComponent(path);
  const absolutePath = join(DIST_EXTENSIONS_DIR, filename);

  try {
    const data = await readFile(absolutePath);
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch {
    return new Response('Extension bundle not found', { status: 404 });
  }
}