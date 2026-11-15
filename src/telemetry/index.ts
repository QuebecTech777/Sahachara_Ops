import { initNewRelicBrowser } from './newrelicBrowser';
import { initBetterStackBrowser } from './betterStackBrowser';

/**
 * Sahachara Ops — Unified Frontend Observability Bootstrap
 *
 * Initializes New Relic Browser monitoring and Better Stack frontend error reporting.
 * Completely non-blocking and fail-open.
 */
export function initFrontendTelemetry(): void {
  // Fire and forget without blocking initial React mount
  initNewRelicBrowser().catch(() => {});
  initBetterStackBrowser();
}
