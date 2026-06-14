// ============================================================
// src/proxy.js
// Builds Express route handlers from config.json routes[].
// Each route reads its target URL from an environment variable
// (target_env) so you can configure destinations in Railway
// without touching code.
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
    const { context, target_env, change_origin, path_rewrite, description } = route;

    if (!context || !target_env) {
      logger.error(`Invalid route — missing context or target_env: ${JSON.stringify(route)}`);
      return;
    }

    // Resolve target URL from the environment variable named in target_env
    // e.g. target_env: "TARGET_API" → reads process.env.TARGET_API
    const target = process.env[target_env];

    if (!target) {
      // Env var not set — skip this route with a loud warning
      logger.warn(`Skipping route "${context}" — env var "${target_env}" is not set. Set it in Railway Variables.`);
      return;
    }

    logger.info(`Registering route: ${context} → ${target}  [via ${target_env}]  (${description || 'no desc'})`);

    // Build the http-proxy-middleware options
    const proxyOptions = {
      target,
      changeOrigin: change_origin !== false, // default true

      // Optional: rewrite path prefixes before forwarding
      ...(path_rewrite ? { pathRewrite: path_rewrite } : {}),

      // ── Event hooks ──────────────────────────────────────

      on: {
        // Fires right before the proxied request is sent upstream
        proxyReq: (proxyReq, req, _res) => {
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

        // Fires when proxy can't reach upstream
        error: (err, req, res) => {
          logger.error({
            type:    'proxy_error',
            method:  req.method,
            path:    req.originalUrl,
            target,
            message: err.message,
          });

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

    app.use(context, createProxyMiddleware(proxyOptions));
  });
}

module.exports = { registerRoutes };
