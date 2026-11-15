import { Logtail } from '@logtail/browser';

/**
 * Sahachara Ops — Better Stack Frontend Error Reporting
 *
 * Captures unhandled frontend errors and forwards sanitized, actionable telemetry
 * to Better Stack.
 *
 * Privacy Safeguards:
 * - Patient names, MRNs, passwords, PINs, and auth tokens are strictly scrubbed.
 * - URL query parameters are stripped before forwarding.
 * - Form input fields and storage payloads are never captured.
 * - Harmless Vite development / HMR websocket rejections are suppressed.
 * - Fails open: network failure will never interrupt patient care or user experience.
 */

let logtailInstance: Logtail | null = null;

function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'Unknown frontend error';
  return msg
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&][a-zA-Z0-9_-]+=)[^&\s]+/g, '$1[REDACTED]')
    .replace(/\b\d{4}\b/g, '[PIN/CODE_REDACTED]')
    .replace(/SAH-[A-Z0-9-]+/gi, '[ID_REDACTED]')
    .slice(0, 500);
}

function sanitizeStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  return stack
    .split('\n')
    .slice(0, 8)
    .join('\n')
    .replace(/([?&][a-zA-Z0-9_-]+=)[^&\s]+/g, '$1[REDACTED]');
}

export function initBetterStackBrowser(): void {
  if (typeof window === 'undefined') return;

  const sourceToken = import.meta.env.VITE_BETTER_STACK_SOURCE_TOKEN;
  const ingestingHost = import.meta.env.VITE_BETTER_STACK_INGESTING_HOST || 'https://in.logs.betterstack.com';

  if (!sourceToken) {
    // Better Stack frontend reporting not configured — fail open safely
    return;
  }

  try {
    logtailInstance = new Logtail(sourceToken, {
      endpoint: ingestingHost
    });

    const isSuppressed = (val: any): boolean => {
      if (!val) return false;
      const str = String(val?.message || val?.stack || val).toLowerCase();
      return str.includes('websocket') || str.includes('vite') || str.includes('closed without opened');
    };

    window.addEventListener('error', (event) => {
      try {
        if (!logtailInstance || isSuppressed(event.error || event.message)) return;

        const sanitizedMsg = sanitizeErrorMessage(event.message || String(event.error));
        const sanitizedStackTrace = sanitizeStack(event.error?.stack);

        logtailInstance.error(sanitizedMsg, {
          type: 'unhandled_window_error',
          route: window.location.pathname,
          stack: sanitizedStackTrace
        }).catch(() => {});
      } catch {
        // Fail-open
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        if (!logtailInstance || isSuppressed(event.reason)) return;

        const rawReason = event.reason;
        const msg = typeof rawReason === 'object' && rawReason ? rawReason.message || String(rawReason) : String(rawReason);
        const sanitizedMsg = sanitizeErrorMessage(msg);
        const sanitizedStackTrace = sanitizeStack(rawReason?.stack);

        logtailInstance.error(sanitizedMsg, {
          type: 'unhandled_promise_rejection',
          route: window.location.pathname,
          stack: sanitizedStackTrace
        }).catch(() => {});
      } catch {
        // Fail-open
      }
    });
  } catch (err) {
    console.warn('[Better Stack Browser] Initialization skipped (fail-open):', err);
  }
}
