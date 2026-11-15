import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { logger, requestContext } from './logger.ts';
import { sanitizeRoute, sanitizeQueryString, sanitizeCorrelationId } from './sanitizer.ts';

/**
 * Sahachara Ops — HTTP Request Observability & Correlation ID Middleware
 *
 * Implements:
 * - Correlation ID propagation and generation.
 * - Route template normalization.
 * - Latency tracking and status code auditing.
 * - Fail-open non-blocking execution.
 * - Zero request/response body logging to protect patient records and tokens.
 */
export function requestObservabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Establish or propagate correlation ID
  const incomingCorrelationId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const correlationId = sanitizeCorrelationId(incomingCorrelationId) || crypto.randomUUID();

  // Set correlation ID on response headers for client tracing
  res.setHeader('X-Correlation-ID', correlationId);

  // Skip noisy static assets if served in production
  const isStaticAsset = req.path.startsWith('/assets/') || /\.(js|css|ico|png|jpg|svg|woff2)$/.test(req.path);

  const startTime = process.hrtime.bigint();

  const onFinish = () => {
    res.removeListener('finish', onFinish);
    res.removeListener('close', onFinish);

    if (isStaticAsset) return;

    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / BigInt(1_000_000));
    const sanitizedRoute = sanitizeRoute(req.path);
    const queryString = sanitizeQueryString(req.url);

    const logPayload = {
      correlationId,
      method: req.method,
      route: sanitizedRoute,
      statusCode: res.statusCode,
      durationMs,
      ...(queryString ? { query: queryString } : {})
    };

    const message = `HTTP ${req.method} ${sanitizedRoute} ${res.statusCode} (${durationMs}ms)`;

    if (res.statusCode >= 500) {
      logger.error(message, logPayload);
    } else if (res.statusCode >= 400) {
      logger.warn(message, logPayload);
    } else {
      logger.info(message, logPayload);
    }
  };

  res.on('finish', onFinish);
  res.on('close', onFinish);

  // Run the rest of the request within the async local storage context
  requestContext.run({ correlationId }, () => {
    next();
  });
}
