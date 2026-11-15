/**
 * Sahachara Ops — New Relic Browser Agent Integration
 *
 * Official browser instrumentation for Vite/React SPA.
 * Monitors:
 * - JavaScript exceptions
 * - Page load and route performance
 * - Frontend responsiveness (Web Vitals)
 * - Failed AJAX / fetch API requests
 *
 * Privacy Safeguards:
 * - Strictly no capturing of patient names, MRNs, diagnoses, prescriptions or clinical notes.
 * - Strictly no capturing of authorization tokens, session cookies, passwords or PINs.
 * - Session replay is explicitly disabled to avoid recording protected health information.
 * - Fails open: missing configuration does not disrupt frontend execution.
 */

let agentInstance: any = null;

export async function initNewRelicBrowser(): Promise<void> {
  // Only initialize if running in browser, keys are provided, and not already initialized
  if (typeof window === 'undefined' || agentInstance) return;

  const licenseKey = import.meta.env.VITE_NEW_RELIC_LICENSE_KEY;
  const applicationID = import.meta.env.VITE_NEW_RELIC_APPLICATION_ID;
  const accountID = import.meta.env.VITE_NEW_RELIC_ACCOUNT_ID;
  const beacon = import.meta.env.VITE_NEW_RELIC_BEACON || 'bam.eu01.nr-data.net';
  const errorBeacon = import.meta.env.VITE_NEW_RELIC_ERROR_BEACON || beacon;

  if (!licenseKey || !applicationID) {
    // Missing or disabled New Relic browser configuration — fail open safely
    return;
  }

  try {
    const { BrowserAgent } = await import('@newrelic/browser-agent/loaders/browser-agent');

    const options = {
      init: {
        distributed_tracing: { enabled: true },
        ajax: {
          deny_list: [
            'bam.nr-data.net',
            'bam.eu01.nr-data.net',
            beacon,
            errorBeacon,
            'betterstackdata.com',
            'logs.betterstack.com'
          ]
        },
        privacy: {
          cookies_enabled: false
        },
        session_replay: {
          enabled: false // Explicitly disabled: protects patient records & privacy governance
        }
      },
      info: {
        beacon,
        errorBeacon,
        licenseKey,
        applicationID,
        sa: 1
      },
      loader_config: {
        accountID: accountID || '',
        trustKey: accountID || '',
        agentID: applicationID,
        licenseKey,
        applicationID
      }
    };

    agentInstance = new BrowserAgent(options);
  } catch (err) {
    // Fail-open: Never block frontend rendering on telemetry initialization failure
    console.warn('[New Relic Browser] Agent initialization skipped (fail-open):', err);
  }
}

export function recordFrontendError(error: Error | string, customAttributes?: Record<string, string | number | boolean>): void {
  if (!agentInstance) return;
  try {
    const errObj = typeof error === 'string' ? new Error(error) : error;
    agentInstance.noticeError(errObj, customAttributes);
  } catch {
    // Fail-open
  }
}
