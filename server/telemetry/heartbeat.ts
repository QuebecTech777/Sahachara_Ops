/**
 * Sahachara Ops — Better Stack Heartbeat Integration
 *
 * Heartbeat monitoring for recurring background and scheduled operational tasks.
 *
 * Governance & Operational Constraints:
 * - Telemetry must fail open: heartbeat failures must never disrupt application tasks.
 * - Heartbeat checks confirm execution cadence; they do NOT certify that database
 *   dumps are verified or restored without separate verification.
 * - Current Architecture Status: Recurring cron backup jobs are NOT currently
 *   configured in this repository. Heartbeat integration is provided for future
 *   cron tasks when their actual execution schedule is formally provisioned.
 */

export async function pingHeartbeat(heartbeatUrl?: string): Promise<boolean> {
  const targetUrl = heartbeatUrl || process.env.BETTER_STACK_HEARTBEAT_URL;
  if (!targetUrl) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);
    return res.ok;
  } catch (err: any) {
    // Fail-open: Never disrupt the calling job on telemetry failure
    return false;
  }
}
