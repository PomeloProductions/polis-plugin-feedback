'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer } = require('../src/server');

const config = {
  port: 0,
  githubToken: 't',
  githubRepo: 'o/n',
  githubApiBase: 'https://api.github.com',
  issueLabels: ['feedback'],
  triageWebhookUrl: null,
  triageWebhookSecret: null,
  largeChangeThreshold: 1200,
  sharedSecret: 'top-secret',
};

function startServer(cfg) {
  return new Promise((resolve) => {
    const server = http.createServer(createServer(cfg));
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function request(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('GET /healthz returns ok without auth', async () => {
  const { server, port } = await startServer(config);
  try {
    const res = await request(port, 'GET', '/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('POST /v1/feedback requires the shared-secret bearer when configured', async () => {
  const { server, port } = await startServer(config);
  try {
    const res = await request(port, 'POST', '/v1/feedback', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 't', body: 'b' }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /v1/feedback returns 400 on invalid JSON (authorized)', async () => {
  const { server, port } = await startServer(config);
  try {
    const res = await request(port, 'POST', '/v1/feedback', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer top-secret' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('unknown route returns 404', async () => {
  const { server, port } = await startServer(config);
  try {
    const res = await request(port, 'GET', '/nope');
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
