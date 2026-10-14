// HireSwipe backend entry point — JavaScript (ES modules), Node.js + Express.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

// Load server/.env relative to this file so it works from any working directory.
config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const rawCorsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:4200').trim();
const ALLOW_ALL_ORIGINS = rawCorsOrigin === '*';
const ALLOWED_ORIGINS = ALLOW_ALL_ORIGINS
  ? '*'
  : rawCorsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: !ALLOW_ALL_ORIGINS,
  }),
);

// --- Routes ---------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'hireswipe-api',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// --- 404 (unknown routes) --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// --- Centralized error handling (must keep 4 params) ------------------------

app.use((err, req, res, next) => {
  const status = Number(err.status || err.statusCode) || 500;

  let code = 'ERROR';
  if (err.type === 'entity.parse.failed') code = 'INVALID_JSON';
  else if (status === 404) code = 'NOT_FOUND';
  else if (status >= 500) code = 'INTERNAL_ERROR';

  console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err);

  res.status(status).json({
    error: {
      code,
      message: status >= 500 && IS_PRODUCTION ? 'Internal server error' : err.message,
      ...(IS_PRODUCTION ? {} : { stack: err.stack }),
    },
  });
});

// --- Start -----------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`HireSwipe API listening on http://localhost:${PORT} (${NODE_ENV})`);
  console.log(`Health check: GET http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT in server/.env to change it.`);
  } else {
    console.error('Failed to start server:', err);
  }
  process.exit(1);
});
