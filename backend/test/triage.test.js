'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { classify, buildHandoff, sign, emitHandoff, TRIAGE_SCHEMA } = require('../src/triage');

test('classify: short body is small and auto-mergeable', () => {
  const c = classify({ body: 'short', context: {}, threshold: 1200 });
  assert.equal(c.classification, 'small');
  assert.equal(c.requiresApproval, false);
});

test('classify: long body exceeds threshold -> large + approval', () => {
  const c = classify({ body: 'x'.repeat(5000), context: {}, threshold: 1200 });
  assert.equal(c.classification, 'large');
  assert.equal(c.requiresApproval, true);
});

test('classify: threshold 0 disables the length heuristic', () => {
  const c = classify({ body: 'x'.repeat(5000), context: {}, threshold: 0 });
  assert.equal(c.classification, 'small');
});

test('classify: explicit context hint forces large', () => {
  const c = classify({ body: 'tiny', context: { requires_approval: true }, threshold: 1200 });
  assert.equal(c.classification, 'large');
  assert.equal(c.requiresApproval, true);
});

test('buildHandoff emits the versioned schema with pr_always invariant', () => {
  const handoff = buildHandoff({
    issue: { number: 7, url: 'https://github.com/o/r/issues/7' },
    repo: 'o/r',
    title: 'Fix',
    body: 'small',
    feedback: { submitter: 'x', context: {} },
    threshold: 1200,
  });
  assert.equal(handoff.schema, TRIAGE_SCHEMA);
  assert.equal(handoff.event, 'issue.triage.requested');
  assert.equal(handoff.policy.pr_always, true);
  assert.equal(handoff.issue.number, 7);
  assert.ok(handoff.emitted_at);
});

test('sign produces a verifiable HMAC-SHA256 signature', () => {
  const body = '{"a":1}';
  const sig = sign(body, 'secret');
  const expected =
    'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(sig, expected);
});

test('emitHandoff: no webhook url -> not delivered, no fetch call', async () => {
  let called = false;
  const res = await emitHandoff({
    handoff: { a: 1 },
    webhookUrl: null,
    webhookSecret: null,
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(res.delivered, false);
  assert.equal(called, false);
});

test('emitHandoff: posts signed body to the webhook', async () => {
  let captured;
  const res = await emitHandoff({
    handoff: { schema: TRIAGE_SCHEMA, event: 'issue.triage.requested' },
    webhookUrl: 'https://runner.example/triage',
    webhookSecret: 'shh',
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 202 };
    },
  });
  assert.equal(res.delivered, true);
  assert.equal(res.status, 202);
  assert.equal(captured.url, 'https://runner.example/triage');
  assert.ok(captured.opts.headers['X-Polis-Signature'].startsWith('sha256='));
  const expected = sign(captured.opts.body, 'shh');
  assert.equal(captured.opts.headers['X-Polis-Signature'], expected);
});
