// ============================================================
// src/healthcheck.js
// Fire a quick GET /_health and print the result.
// Run with: node src/healthcheck.js
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const config   = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8'));
const PORT     = process.env.PORT || config.server.http_port || 3000;

const options = {
  hostname: 'localhost',
  port:     PORT,
  path:     '/_health',
  method:   'GET',
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (err) => {
  console.error(`Healthcheck failed: ${err.message}`);
  console.error('Is the server running?');
  process.exit(1);
});

req.end();
