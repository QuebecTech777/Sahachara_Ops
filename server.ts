import http from 'http';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.ts';
import { isSupabaseServerActive } from './server/supabaseServer.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Cross-Origin Resource Sharing (CORS) configured for Vercel frontend & local preview
  app.use(cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(s => s.trim()) : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-name', 'x-patient-mrn']
  }));

  app.use(express.json());

  // Mount API routes with RBAC protection
  app.use('/api', apiRouter);

  // Health check endpoint for Render & monitoring
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
        security: 'Strict @sahachara.com Domain RBAC + HIPAA Audit Trail'
      }
    });
  });

  const isProduction = process.env.NODE_ENV === 'production';

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
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sahachara Ops] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
