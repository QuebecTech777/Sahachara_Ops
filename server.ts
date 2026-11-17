// 1. Initialize New Relic APM before any application modules are loaded
import './server/telemetry/newrelic.ts';

import http from 'http';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.ts';
import { isSupabaseServerActive } from './server/supabaseServer.ts';
import { getSessionSecret } from './server/rbacMiddleware.ts';
import { requestObservabilityMiddleware } from './server/telemetry/requestLogger.ts';
import { logger } from './server/telemetry/logger.ts';
import { spaFallbackLimiter } from './server/rateLimiter.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Fail-closed production configuration guard
  if (process.env.NODE_ENV === 'production') {
    try {
      getSessionSecret();
    } catch (err: any) {
      console.error(`[Sahachara Ops Fatal Configuration Error] ${err.message}`);
      process.exit(1);
    }
  }

  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Set trust proxy for Render load-balancers (1 hop)
  app.set('trust proxy', 1);

  const isProduction = process.env.NODE_ENV === 'production';

  // Explicitly trusted production origins
  const PRODUCTION_ORIGINS = [
    'https://os.sahachara.com'
  ];

  // Local development origins (permitted in non-production environments)
  const LOCAL_DEV_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];

  const configuredClientOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
    : [];

  const configuredAppOrigins = process.env.APP_URL
    ? process.env.APP_URL.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
    : [];

  // Deduplicate and assemble allowed origins set
  const allowedOriginsSet = new Set<string>([
    ...PRODUCTION_ORIGINS,
    ...(isProduction ? [] : LOCAL_DEV_ORIGINS),
    ...configuredClientOrigins,
    ...configuredAppOrigins
  ]);

  // Cross-Origin Resource Sharing (CORS) with explicit origin validation
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOriginsSet.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin ${origin} not allowed by policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-name', 'x-patient-mrn', 'x-correlation-id', 'x-request-id'],
    exposedHeaders: ['X-Correlation-ID']
  }));

  // Request Observability & Correlation ID Tracking (Fail-open, Privacy-Preserving)
  app.use(requestObservabilityMiddleware);

  app.use(express.json({ limit: '10mb' }));

  // Malformed JSON payload handler: return structured JSON 400 instead of default Express HTML stack trace
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_JSON_PAYLOAD',
        error: 'Malformed JSON payload in request body'
      });
    }
    next(err);
  });

  // Mount API routes with RBAC protection
  app.use('/api', apiRouter);

  // Centralized API unhandled error handler: guarantees JSON response format and prevents HTML error leaks
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`[API Unhandled Error] ${err?.message || 'Unknown internal error'}`, {
      stack: err?.stack
    });
    if (res.headersSent) {
      return;
    }
    const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(statusCode).json({
      success: false,
      code: err?.code || 'INTERNAL_SERVER_ERROR',
      error: 'An unexpected internal server error occurred'
    });
  });

  // Health check endpoint for Render & Better Stack uptime monitoring
  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({
      status: 'operational',
      clinic: 'Sahachara Ayurveda Yoga Ecoliving',
      code: 'SAH',
      location: 'Mannamkala Road, Munnar Hills, Adimali, Kerala, India 685561',
      domain: 'os.sahachara.com',
      timestamp: new Date().toISOString(),
      architecture: {
        frontend: 'React 19 + IBM Carbon Design System v11 (Vercel Ready)',
        backend: 'Express TypeScript Service Architecture (Render Ready)',
        database: isSupabaseServerActive() ? 'PostgreSQL on Supabase (Active)' : 'PostgreSQL on Supabase via Prisma ORM',
        security: 'Strict @sahachara.com Domain RBAC + Clinical Data Governance Audit Trail'
      }
    });
  });

  // Root informational route for backend service discovery
  app.get('/', (_req, res) => {
    res.json({
      service: 'Sahachara Ops Clinical Backend Service',
      status: 'operational',
      frontend: 'https://os.sahachara.com',
      health: '/health'
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', spaFallbackLimiter, (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // Graceful shutdown handling with telemetry flushing and fail-fast exit status preservation
  let isShuttingDown = false;
  const shutdown = async (signal: string, exitCode: number = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown (exit code: ${exitCode})...`);
    server.close(async () => {
      logger.info('HTTP server closed. Flushing buffered telemetry...');
      await logger.flush();
      logger.info(`Telemetry flushed. Process exiting with code ${exitCode}.`);
      process.exit(exitCode);
    });

    // Force shutdown if lingering connections do not terminate in 10 seconds
    setTimeout(() => {
      process.exit(exitCode !== 0 ? exitCode : 1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('unhandledRejection', (reason: any) => {
    logger.error(`[Process Unhandled Rejection - Fatal] ${reason instanceof Error ? reason.message : String(reason)}`, {
      stack: reason instanceof Error ? reason.stack : undefined
    });
    // Preserve Node.js fail-fast semantics: flush telemetry and terminate with non-zero exit code for orchestrator restart
    shutdown('unhandledRejection', 1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`[Sahachara Ops] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
