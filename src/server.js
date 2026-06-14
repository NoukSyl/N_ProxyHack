// ============================================================
// src/server.js
// Entry point. Reads config.json, wires up Express + logging
// + proxy routes, then starts HTTP (and optionally HTTPS).
// ============================================================

require('dotenv').config(); // load .env if present (Railway injects env vars this way)

const express    = require('express');
const http       = require('http');
const https      = require('https');
const fs         = require('fs-extra');
const path       = require('path');
const morgan     = require('morgan');

const { buildLogger }    = require('./logger');
const { registerRoutes } = require('./proxy');

// ── 1. Load config ───────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  console.error(`[FATAL] Cannot read config.json: ${err.message}`);
  process.exit(1);
}

// ── 2. Boot logger ───────────────────────────────────────────
const logger = buildLogger(config.logging);
logger.info('Logger initialised ✓');
logger.info(`Loaded config from ${CONFIG_PATH}`);

// ── 3. Create Express app ────────────────────────────────────
const app = express();

// Morgan → Winston bridge: one access log line per request
const morganStream = {
  write: (message) => logger.info(message.trim()),
};
app.use(morgan(
  ':remote-addr :method :url :status :res[content-length] - :response-time ms',
  { stream: morganStream }
));

// Parse JSON bodies — useful if you add an admin/health endpoint later
app.use(express.json());

// ── 4. Health-check endpoint (does NOT get proxied) ──────────
app.get('/_health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    routes:    config.routes.map((r) => ({ context: r.context, target: r.target })),
  });
});

// ── 5. Register proxy routes from config.json ────────────────
registerRoutes(app, config.routes, logger);

// ── 6. 404 catch-all (only reached if no route matched) ──────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'No proxy route matched this path.' });
});

// ── 7. Global Express error handler ─────────────────────────
// Express calls this when next(err) is invoked anywhere
app.use((err, _req, res, _next) => {
  logger.error({ type: 'express_error', message: err.message, stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── 8. Start HTTP server ─────────────────────────────────────
// Railway sets PORT automatically; we fall back to config or 3000
const HTTP_PORT = process.env.PORT || config.server.http_port || 3000;

const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, () => {
  logger.info(`HTTP  server listening on port ${HTTP_PORT} ✓`);
});

// ── 9. Start HTTPS server (optional) ────────────────────────
if (config.server.enable_https) {
  const certPath = path.resolve(__dirname, '..', config.server.ssl.cert);
  const keyPath  = path.resolve(__dirname, '..', config.server.ssl.key);

  try {
    const sslOptions = {
      cert: fs.readFileSync(certPath),
      key:  fs.readFileSync(keyPath),
    };

    const HTTPS_PORT = process.env.HTTPS_PORT || config.server.https_port || 3443;
    const httpsServer = https.createServer(sslOptions, app);

    httpsServer.listen(HTTPS_PORT, () => {
      logger.info(`HTTPS server listening on port ${HTTPS_PORT} ✓`);
    });

    httpsServer.on('error', (err) => {
      logger.error(`HTTPS server error: ${err.message}`);
    });

  } catch (err) {
    logger.error(`Could not load SSL certs — HTTPS disabled: ${err.message}`);
  }
}

// ── 10. Graceful shutdown ────────────────────────────────────
// Catch SIGTERM (Railway/Docker sends this on redeploy) and SIGINT (Ctrl+C)
function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down gracefully...`);
  httpServer.close(() => {
    logger.info('HTTP server closed. Bye! 👋');
    process.exit(0);
  });

  // Force exit after 10s if something hangs
  setTimeout(() => {
    logger.warn('Force exiting after 10s timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections so the process doesn't silently die
process.on('unhandledRejection', (reason) => {
  logger.error({ type: 'unhandledRejection', reason: String(reason) });
});
