'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleFeedback, validate, renderIssueBody } = require('../src/handler');

const baseConfig = {
  port: 8080,
  githubToken: 'test-token',
  githubRepo: 'PomeloProductions/polis-plugin-feedback',
  githubApiBase: 'https://api.github.com',
  issueLabels: ['feedback'],
  triageWebhookUrl: 'https://runner.example/triage',
  triageWebhookSecret: 'shh',
  largeChangeThreshold: 1200,
  sharedSecret: null,
};

/** A createIssue stub that records its args and returns a fake issue. */
function makeIssueStub() {
  const calls = [];
  const impl = async (opts) => {
    calls.push(opts);
    return { number: 42, url: 'https://github.com/o/r/issues/42', apiUrl: 'https://api/.../42' };
  };
  return { impl, calls };
}

function makeEmitStub(delivered = true) {
  const calls = [];
  const impl = async (opts) => {
    calls.push(opts);
    return { delivered, status: delivered ? 200 : 500 };
  };
  return { impl, calls };
}

test('validate accepts a well-formed submission', () => {
  assert.deepEqual(validate({ title: 'Bug', body: 'It broke' }), []);
});

test('validate rejects missing title and body', () => {
  const errs = validate({});
  assert.equal(errs.length, 2);
});

test('validate rejects non-object context and non-string submitter', () => {
  const errs = validate({ title: 't', body: 'b', context: [1, 2], submitter: 5 });
  assert.equal(errs.length, 2);
});

test('handleFeedback creates an issue and emits a small-change handoff', async () => {
  const issue = makeIssueStub();
  const emit = makeEmitStub(true);

  const res = await handleFeedback({
    payload: { title: 'Typo on homepage', body: 'The word "teh" should be "the".', submitter: 'alice@example.com' },
    config: baseConfig,
    createIssueImpl: issue.impl,
    emitHandoffImpl: emit.impl,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.issue.number, 42);
  assert.equal(res.body.triage.classification, 'small');
  assert.equal(res.body.triage.requires_approval, false);
  assert.equal(res.body.triage.delivered, true);

  // Issue created with configured repo/token/labels, never the live API.
  assert.equal(issue.calls.length, 1);
  assert.equal(issue.calls[0].repo, baseConfig.githubRepo);
  assert.deepEqual(issue.calls[0].labels, ['feedback']);
  assert.match(issue.calls[0].body, /Submitter:\*\* alice@example.com/);

  // Handoff carries the two invariants.
  assert.equal(emit.calls.length, 1);
  const handoff = emit.calls[0].handoff;
  assert.equal(handoff.schema, 'polis.feedback.triage/v1');
  assert.equal(handoff.policy.pr_always, true);
  assert.equal(handoff.policy.requires_approval, false);
  assert.equal(handoff.issue.number, 42);
});

test('handleFeedback flags a large change (over threshold) as requires_approval', async () => {
  const issue = makeIssueStub();
  const emit = makeEmitStub(true);
  const bigBody = 'x'.repeat(2000);

  const res = await handleFeedback({
    payload: { title: 'Big refactor request', body: bigBody },
    config: baseConfig,
    createIssueImpl: issue.impl,
    emitHandoffImpl: emit.impl,
  });

  assert.equal(res.body.triage.classification, 'large');
  assert.equal(res.body.triage.requires_approval, true);
  assert.equal(emit.calls[0].handoff.policy.requires_approval, true);
});

test('handleFeedback honors an explicit requires_approval context hint', async () => {
  const issue = makeIssueStub();
  const emit = makeEmitStub(true);

  const res = await handleFeedback({
    payload: { title: 'Small-looking but sensitive', body: 'tweak auth', context: { requires_approval: true } },
    config: baseConfig,
    createIssueImpl: issue.impl,
    emitHandoffImpl: emit.impl,
  });

  assert.equal(res.body.triage.classification, 'large');
  assert.equal(res.body.triage.requires_approval, true);
});

test('handleFeedback returns 422 on invalid payload without creating an issue', async () => {
  const issue = makeIssueStub();
  const emit = makeEmitStub();

  const res = await handleFeedback({
    payload: { title: '' },
    config: baseConfig,
    createIssueImpl: issue.impl,
    emitHandoffImpl: emit.impl,
  });

  assert.equal(res.status, 422);
  assert.equal(res.body.error, 'validation_failed');
  assert.equal(issue.calls.length, 0);
  assert.equal(emit.calls.length, 0);
});

test('handleFeedback reports undelivered handoff when no webhook configured', async () => {
  const issue = makeIssueStub();
  const emit = makeEmitStub(false);

  const res = await handleFeedback({
    payload: { title: 'ok', body: 'fine' },
    config: { ...baseConfig, triageWebhookUrl: null },
    createIssueImpl: issue.impl,
    emitHandoffImpl: emit.impl,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.triage.delivered, false);
});

test('renderIssueBody embeds a machine-readable context block', () => {
  const body = renderIssueBody({
    body: 'hi',
    submitter: 'bob',
    context: { url: '/dashboard', build: 'sha-abc' },
  });
  assert.match(body, /```json/);
  assert.match(body, /"url": "\/dashboard"/);
});
