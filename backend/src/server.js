'use strict';

const http = require('http');
const { loadConfig } = require('./config');
const { handleFeedback } = require('./handler');

/**
 * HTTP transport for the feedback plugin backend.
 *
 * Routes:
 *   GET  /healthz          → liveness probe (no auth)
 *   POST /v1/feedback      → submit feedback → create issue → emit triage handoff
 *
 * Auth: if `config.sharedSecret` is set, POST /v1/feedback requires
 * `Authorization: Bearer <sharedSecret>` (the controller injects the same secret
 * into both this backend and the frontend bundle's config).
 */

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Build the request listener. Config is injected so tests can supply a fake.
 *
 * @param {import('./config').Config} config
 * @returns {import('http').RequestListener}
 */
function createServer(config) {
  return async function requestListener(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        return send(res, 200, { status: 'ok' });
      }

      if (req.method === 'POST' && req.url === '/v1/feedback') {
        if (!authorized(req, config)) {
          return send(res, 401, { error: 'unauthorized' });
        }
        const raw = await readBody(req);
        let payload;
        try {
          payload = JSON.parse(raw || '{}');
        } catch {
          return send(res, 400, { error: 'invalid_json' });
        }
        const result = await handleFeedback({ payload, config });
        return send(res, result.status, result.body);
      }

      return send(res, 404, { error: 'not_found' });
    } catch (err) {
      // Never leak tokens/internals; log server-side, return a generic error.
      // eslint-disable-next-line no-console
      console.error('[feedback] request failed:', err && err.message);
      return send(res, 502, { error: 'upstream_error' });
    }
  };
}

function authorized(req, config) {
  if (!config.sharedSecret) return true;
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${config.sharedSecret}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/* istanbul ignore next — entrypoint, exercised by the container not unit tests */
function main() {
  const config = loadConfig();
  const server = http.createServer(createServer(config));
  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[feedback] listening on :${config.port} → ${config.githubRepo}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { createServer, readBody };
