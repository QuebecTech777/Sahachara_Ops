import { AsyncLocalStorage } from 'node:async_hooks';
import { Logtail } from '@logtail/node';
import {
  sanitizeMetadata,
  sanitizeError,
  sanitizeCorrelationId,
  sanitizeLogMessage
} from './sanitizer.ts';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  correlationId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  actorRole?: string;
  error?: unknown;
  [key: string]: any;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  correlationId: string;
  message: string;
  context?: Record<string, any>;
}

export const requestContext = new AsyncLocalStorage<{ correlationId: string }>();

class AppLogger {
  private logtail: Logtail | null = null;
  private readonly serviceName = 'sahachara-ops-backend';
  private readonly environment: string;
  private readonly isProduction: boolean;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.isProduction = this.environment === 'production';

    const sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN || process.env.LOGTAIL_SOURCE_TOKEN;
    const rawIngestingHost = process.env.BETTER_STACK_INGESTING_HOST || process.env.LOGTAIL_INGESTING_HOST || 'https://s2837771.us-west-2a.betterstackdata.com';
    const ingestingHost = rawIngestingHost.startsWith('http://') || rawIngestingHost.startsWith('https://')
      ? rawIngestingHost
      : `https://${rawIngestingHost}`;

    if (sourceToken) {
      try {
        this.logtail = new Logtail(sourceToken, {
          endpoint: ingestingHost,
          batchInterval: 1000,
          batchSize: 20,
          retryCount: 3,
          retryBackoff: 500
        });

        // Fail-open safety: handle any background sync errors without disrupting app execution
        (this.logtail as any).setSync?.((logs: any) => {
          // If custom sync is used, it fails open
        });
      } catch (err: any) {
        console.warn('[Better Stack] Logger initialization bypassed (fail-open mode active):', err?.message || err);
        this.logtail = null;
      }
    }
  }

  private getActiveCorrelationId(explicitId?: string): string {
    if (explicitId) return sanitizeCorrelationId(explicitId) || 'system';
    const store = requestContext.getStore();
    if (store?.correlationId) return sanitizeCorrelationId(store.correlationId) || 'system';
    return 'system';
  }

  public formatLogEntry(level: LogLevel, message: string, rawContext?: LogContext): StructuredLogEntry {
    const timestamp = new Date().toISOString();
    const correlationId = this.getActiveCorrelationId(rawContext?.correlationId);
    const sanitizedMsg = sanitizeLogMessage(message);

    // Sanitize context and redact sensitive fields
    const sanitizedContext = rawContext ? sanitizeMetadata(rawContext) : {};
    delete sanitizedContext.correlationId; // Already top-level

    if (rawContext?.error) {
      sanitizedContext.error = sanitizeError(rawContext.error);
    }

    return {
      timestamp,
      level,
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      message: sanitizedMsg,
      ...(Object.keys(sanitizedContext).length > 0 ? { context: sanitizedContext } : {})
    };
  }

  private writeLog(level: LogLevel, message: string, rawContext?: LogContext) {
    const logEntry = this.formatLogEntry(level, message, rawContext);
    const sanitizedContext = logEntry.context || {};
    const { correlationId } = logEntry;
    const finalMessage = logEntry.message;

    // 1. Output to local stdout/stderr via safe structured JSON serialization (CWE-117 log injection defense)
    if (process.env.BETTER_STACK_DISABLE_CONSOLE !== 'true') {
      const jsonStr = JSON.stringify(logEntry) + '\n';
      if (level === 'error') {
        process.stderr.write(jsonStr);
      } else {
        process.stdout.write(jsonStr);
      }
    }

    // 2. Forward to Better Stack (Non-blocking, fail-open)
    if (this.logtail) {
      try {
        const betterStackPayload = {
          service: this.serviceName,
          environment: this.environment,
          correlationId,
          ...sanitizedContext
        };

        let promise: Promise<any>;
        if (level === 'error') {
          promise = this.logtail.error(finalMessage, betterStackPayload);
        } else if (level === 'warn') {
          promise = this.logtail.warn(finalMessage, betterStackPayload);
        } else if (level === 'debug') {
          promise = this.logtail.debug(finalMessage, betterStackPayload);
        } else {
          promise = this.logtail.info(finalMessage, betterStackPayload);
        }

        // Catch promise rejection so telemetry network issues NEVER crash or reject
        promise?.catch?.(() => {});
      } catch {
        // Fail-open
      }
    }
  }

  public info(message: string, context?: LogContext): void {
    this.writeLog('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.writeLog('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.writeLog('error', message, context);
  }

  public debug(message: string, context?: LogContext): void {
    this.writeLog('debug', message, context);
  }

  /**
   * Explicitly flushes buffered logs to Better Stack during graceful shutdown.
   * Enforces a hard timeout to avoid hanging the shutdown sequence.
   */
  public async flush(timeoutMs = 2000): Promise<void> {
    if (!this.logtail) return;
    try {
      const flushPromise = this.logtail.flush();
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeoutMs));
      await Promise.race([flushPromise, timeoutPromise]);
    } catch {
      // Fail-open
    }
  }
}

export const logger = new AppLogger();
