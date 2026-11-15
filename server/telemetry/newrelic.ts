import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Sahachara Ops — New Relic APM Bootstrap
 *
 * Requirements:
 * - Initialize the agent before application modules that need instrumentation.
 * - Follow the existing TypeScript build and startup configuration.
 * - Ensure the absence of a New Relic license key does not break application startup (fail-open).
 */
const isNewRelicConfigured = Boolean(
  process.env.NEW_RELIC_LICENSE_KEY &&
  process.env.NEW_RELIC_ENABLED !== 'false'
);

if (isNewRelicConfigured) {
  try {
    require('newrelic');
  } catch (err: any) {
    console.warn('[New Relic APM] Initialization failed, continuing in fail-open mode:', err?.message || err);
  }
} else {
  // Silent fail-open when license key is absent in development or unconfigured environments
}
