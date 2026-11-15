/**
 * SAHACHARA OPS — RATE LIMITING SECURITY MIDDLEWARE
 *
 * Remediates CodeQL CWE-770 (js/missing-rate-limiting):
 * - Alert #21: SPA fallback route (server.ts)
 * - Alert #22: Global API authentication middleware (server/routes.ts)
 * - Alert #23: Staff authentication login (server/routes.ts)
 * - Alert #24: Staff therapy authorization query (server/routes.ts)
 * - Alert #25: Grant staff therapy authorization (server/routes.ts)
 * - Alert #26: Revoke staff therapy authorization (server/routes.ts)
 *
 * Operational Threat Exposure & Guardrails:
 * - Render proxy alignment: respects standard trust proxy hops.
 * - Prevents account enumeration: login rate limit returns standardized, non-revealing error message.
 * - Protects expensive database operations while preventing disruption to legitimate hospital workflows.
 * - Skips throttling during automated CI / test runs unless explicitly tested.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const isTestOrCI = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

/**
 * Standard JSON response handler for rate-limited requests
 */
function createRateLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'TooManyRequests',
      code: 'RATE_LIMIT_EXCEEDED',
      message
    });
  };
}

/**
 * 1. SPA Fallback Limiter (Alert #21)
 * Protects index.html file streaming on unmatched GET * routes from DoS flooding.
 * Window: 15 minutes, Limit: 300 requests per IP.
 */
export const spaFallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestOrCI,
  handler: createRateLimitHandler('Too many navigation requests from this IP. Please try again later.')
});

/**
 * 2. Global API Limiter (Alert #22)
 * Protects universal API authentication and operational endpoints.
 * Window: 1 minute, Limit: 600 requests per IP (high throughput for hospital dashboard polling).
 */
export const apiGlobalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => isTestOrCI || req.path === '/health',
  handler: createRateLimitHandler('API rate limit exceeded. Please throttle client requests.')
});

/**
 * 3. Authentication Login Limiter (Alert #23)
 * Protects POST /api/auth/login against brute-force password guessing and credential stuffing.
 * Window: 15 minutes, Limit: 10 failed or total attempts per IP.
 * Uses a generic, non-revealing response to eliminate account enumeration risk.
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestOrCI,
  handler: createRateLimitHandler('Too many login attempts. Please wait 15 minutes before retrying.')
});

/**
 * 4. Staff Therapy Authorization Read Limiter (Alert #24)
 * Protects GET /api/staff-therapy/authorizations from automated scraping of staff clinical privileges.
 * Window: 15 minutes, Limit: 100 requests per IP.
 */
export const therapyAuthReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestOrCI,
  handler: createRateLimitHandler('Staff authorization query rate limit exceeded.')
});

/**
 * 5. Staff Therapy Authorization Mutation Limiter (Alerts #25, #26)
 * Protects grant and revoke endpoints against rapid privilege mutation spam.
 * Window: 15 minutes, Limit: 30 requests per IP.
 */
export const therapyAuthMutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestOrCI,
  handler: createRateLimitHandler('Staff authorization mutation rate limit exceeded.')
});
