'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIssue } = require('../src/github');

// These tests NEVER hit the live GitHub API — fetch is always injected.

test('createIssue posts to the repo issues endpoint with auth + labels', async () => {
  let captured;
  const issue = await createIssue({
    token: 'tkn',
    repo: 'owner/name',
    apiBase: 'https://api.github.com',
    title: 'Title',
    body: 'Body',
    labels: ['feedback', 'triage'],
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 201,
        json: async () => ({ number: 99, html_url: 'https://gh/issues/99', url: 'https://api/99' }),
      };
    },
  });

  assert.equal(captured.url, 'https://api.github.com/repos/owner/name/issues');
  assert.equal(captured.opts.headers.Authorization, 'Bearer tkn');
  const sent = JSON.parse(captured.opts.body);
  assert.deepEqual(sent.labels, ['feedback', 'triage']);
  assert.equal(issue.number, 99);
  assert.equal(issue.url, 'https://gh/issues/99');
});

test('createIssue throws on a non-ok response', async () => {
  await assert.rejects(
    createIssue({
      token: 't',
      repo: 'o/n',
      apiBase: 'https://api.github.com',
      title: 'T',
      body: 'B',
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }),
    }),
    /GitHub issue creation failed \(403\): forbidden/,
  );
});

test('createIssue rejects a malformed repo', async () => {
  await assert.rejects(
    createIssue({
      token: 't',
      repo: 'not-a-repo',
      apiBase: 'https://api.github.com',
      title: 'T',
      body: 'B',
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    }),
    /Invalid repo/,
  );
});

test('createIssue honors a GitHub Enterprise api base', async () => {
  let captured;
  await createIssue({
    token: 't',
    repo: 'o/n',
    apiBase: 'https://ghe.internal/api/v3/',
    title: 'T',
    body: 'B',
    fetchImpl: async (url) => {
      captured = url;
      return { ok: true, json: async () => ({ number: 1, html_url: 'u', url: 'a' }) };
    },
  });
  assert.equal(captured, 'https://ghe.internal/api/v3/repos/o/n/issues');
});
