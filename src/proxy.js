// ============================================================
// src/proxy.js
// Builds Express route handlers from config.json routes[].
// Each route gets its own createProxyMiddleware instance so
// configs stay isolated and logs stay specific.
// ============================================================

const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Register all proxy routes on the given Express app.
 *
 * @param {import('express').Application} app
 * @param {object[]} routes  — config.json → routes[]
 * @param {import('winston').Logger} logger
 */
function registerRoutes(app, routes, logger) {
  if (!Array.isArray(routes) || routes.length === 0) {
    logger.warn('No proxy routes configured — server will 404 everything.');
    return;
  }

  routes.forEach((route) => {
    const { context, target, change_origin, path_rewrite, description } = route;

    if (!context || !target) {
      logger.error(`Invalid route — missing context or target: ${JSON.stringify(route)}`);
      return;
    }

    logger.info(`Registering route: ${context} → ${target}  (${description || 'no desc'})`);

    // Build the http-proxy-middleware options
    const proxyOptions = {
      target,
      changeOrigin: change_origin !== false, // default true

      // Optional: rewrite path prefixes before forwarding
      ...(path_rewrite ? { pathRewrite: path_rewrite } : {}),

      // ── Event hooks ──────────────────────────────────────

      // Fires right before the proxied request is sent upstream
      on: {
        proxyReq: (proxyReq, req, _res) => {
          // Stamp a custom header so upstream servers know the traffic came through us
          proxyReq.setHeader('X-Proxy-By', 'lo-reverse-proxy');
          proxyReq.setHeader('X-Forwarded-For', req.ip || req.socket.remoteAddress);

          logger.debug(`→ Forwarding ${req.method} ${req.originalUrl} to ${target}`);
        },

        // Fires when upstream responds
        proxyRes: (proxyRes, req, _res) => {
          logger.info({
            type:   'proxy_response',
            method: req.method,
            path:   req.originalUrl,
            target,
            status: proxyRes.statusCode,
          });
        },

        // Fires when the proxy itself throws (network error, refused connection, etc.)
        error: (err, req, res) => {
          logger.error({
            type:    'proxy_error',
            method:  req.method,
            path:    req.originalUrl,
            target,
            message: err.message,
          });

          // Don't crash — send a clean 502 back to the client
          if (!res.headersSent) {
            res.status(502).json({
              error:   'Bad Gateway',
              message: `Proxy could not reach upstream: ${target}`,
              path:    req.originalUrl,
            });
          }
        },
      },
    };

    // Mount this route on the Express app
    app.use(context, createProxyMiddleware(proxyOptions));
  });
}

module.exports = { registerRoutes };
