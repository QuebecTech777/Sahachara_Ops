import { initNewRelicBrowser } from './newrelicBrowser';
import { initBetterStackBrowser } from './betterStackBrowser';

/**
 * Sahachara Ops — Unified Frontend Observability Bootstrap
 *
 * Initializes New Relic Browser monitoring and Better Stack frontend error reporting.
 * Completely non-blocking and fail-open.
 */
export function initFrontendTelemetry(): void {
  // Fire and forget without blocking initial React mount; log warning on unhandled failure
  initNewRelicBrowser().catch((err) => {
    console.warn('[Frontend Telemetry] New Relic Browser failed to initialize:', err);
  });
  initBetterStackBrowser();
}
