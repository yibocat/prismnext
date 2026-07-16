/**
 * Content-Security-Policy for the Prism Next renderer.
 *
 * Problem: {@link ../../renderer/index.html} had no CSP, so any XSS (AI markdown
 * output, PDF.js, rehype-raw) gave an attacker full control of the renderer
 * context — and via the fs IPC (see active-project-roots.ts) the whole filesystem.
 *
 * Approach: inject CSP via `session.defaultSession.webRequest.onHeadersReceived`,
 * dev/prod aware. The in-app browser `<webview>` lives in a separate partition
 * (persist:browser, see browser-view.tsx / browser.ts), so it is unaffected and
 * external pages keep their own headers. We inject only on main-frame responses
 * (the renderer's HTML document) — subresource CSP is enforced against the
 * document's policy, so injecting per-subresource is unnecessary.
 *
 * Threat model note: `img-src` allows `http:`/`https:` because the renderer
 * legitimately loads external favicons (browser bookmarks) and remote images
 * embedded in AI markdown output. Images cannot execute script, so this is an
 * acceptable tracking/exfil surface; script execution is locked to 'self'.
 */
import type { Session } from "electron";

/** CSP for production (file:// build). Strict: no inline/eval script. */
function prodCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: literature-pdf: http: https:",
    "connect-src 'self' literature-pdf: blob:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for dev (Vite http://localhost + HMR). Adds eval/inline script + ws. */
function devCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: literature-pdf: http: https:",
    "connect-src 'self' literature-pdf: blob: ws://localhost:* http://localhost:*",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Build the CSP header value. `isPackaged` selects prod vs dev policy. */
export function buildCsp(isPackaged: boolean): string {
  return isPackaged ? prodCsp() : devCsp();
}

/**
 * Install CSP injection on the given session. Call once after `app.whenReady()`
 * on `session.defaultSession`. Only main-frame (document) responses are tagged.
 */
export function installCsp(targetSession: Session): void {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame") {
      callback({});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [buildCsp(appIsPackaged())],
      },
    });
  });
}

// Indirection so tests can stub; resolved from `electron`'s `app` at runtime.
function appIsPackaged(): boolean {
  try {
    // Lazy require to avoid hard-failing when electron is stubbed in tests.
    const { app } = require("electron") as { app?: { isPackaged?: boolean } };
    return !!app?.isPackaged;
  } catch {
    return false;
  }
}
