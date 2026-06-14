# lo-reverse-proxy

Reverse proxy server built with Express + http-proxy-middleware.
For self-testing and learning only.

---

## Project Structure

```
reverse-proxy/
├── src/
│   ├── server.js        ← Entry point. Starts HTTP/HTTPS, wires everything.
│   ├── proxy.js         ← Reads routes[] from config and registers them on Express.
│   ├── logger.js        ← Winston logger: colored console + rotating log files.
│   └── healthcheck.js   ← Quick script to ping /_health and verify the server runs.
├── logs/                ← Auto-created. proxy.log + error.log live here.
├── certs/               ← Drop your SSL cert+key here if enabling HTTPS.
├── config.json          ← ALL configuration: ports, routes, logging, SSL toggle.
├── .env.example         ← Copy to .env for local env vars.
├── package.json
└── .gitignore
```

---

## config.json — Quick Reference

| Key | What it does |
|-----|-------------|
| `server.http_port` | Port for HTTP (default 3000) |
| `server.https_port` | Port for HTTPS (default 3443) |
| `server.enable_https` | Set `true` to enable HTTPS |
| `server.ssl.cert/key` | Paths to your SSL cert and key |
| `logging.level` | `debug` / `info` / `warn` / `error` |
| `logging.log_dir` | Where log files go |
| `routes[].context` | URL prefix to match (e.g. `/api`) |
| `routes[].target` | Where to forward the request |
| `routes[].path_rewrite` | Strip/replace path prefix before forwarding |
| `routes[].change_origin` | Rewrite Host header to match target (almost always `true`) |

---

## Install & Run on Linux

```bash
# 1. Clone / copy the project
cd reverse-proxy

# 2. Install dependencies
npm install

# 3. (Optional) copy env file
cp .env.example .env

# 4. Edit config.json — set your target URLs
nano config.json

# 5. Start
npm start

# Dev mode (auto-restarts on file change)
npm run dev

# Health check
npm test
```

---

## Deploy on Railway

1. Push this folder to a GitHub repo.
2. Create a new project on [railway.app](https://railway.app) → "Deploy from GitHub".
3. Railway auto-detects Node.js and runs `npm start`.
4. Railway injects `PORT` automatically — the server reads it via `process.env.PORT`.
5. Set any extra env vars in Railway's **Variables** tab (same keys as `.env.example`).

> **HTTPS on Railway**: Railway terminates SSL for you at the edge.  
> Keep `enable_https: false` in config — no certs needed.

---

## Endpoints

| Path | Description |
|------|-------------|
| `GET /_health` | Returns server status + registered routes. NOT proxied. |
| Everything else | Matched against `routes[]` in config.json and forwarded. |

---

## Generate Self-Signed Certs (Local HTTPS Testing)

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key \
  -out certs/server.crt -days 365 -nodes \
  -subj "/CN=localhost"
```

Then set `"enable_https": true` in config.json.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Upstream unreachable | Returns `502 Bad Gateway` with JSON error body |
| No route matched | Returns `404 Not Found` |
| Express internal error | Returns `500 Internal Server Error` |
| Unhandled promise rejection | Logged to `logs/error.log`, process continues |
| `SIGTERM` / `SIGINT` | Graceful shutdown — drains connections, then exits |
