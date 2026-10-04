'use strict';

const { createIssue } = require('./github');
const { buildHandoff, emitHandoff } = require('./triage');

/**
 * Core feedback→issue→triage logic, decoupled from the HTTP transport so it can
 * be unit-tested with injected `createIssueImpl` / `emitHandoffImpl`.
 *
 * @param {Object} params
 * @param {Object} params.payload   Parsed submission { title, body, context, submitter }.
 * @param {import('./config').Config} params.config
 * @param {Function} [params.createIssueImpl=createIssue]
 * @param {Function} [params.emitHandoffImpl=emitHandoff]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<{ status: number, body: Object }>}
 */
async function handleFeedback(params) {
  const {
    payload,
    config,
    createIssueImpl = createIssue,
    emitHandoffImpl = emitHandoff,
    fetchImpl,
  } = params;

  const errors = validate(payload);
  if (errors.length) {
    return { status: 422, body: { error: 'validation_failed', messages: errors } };
  }

  const submitter = payload.submitter ? String(payload.submitter) : null;
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const issueBody = renderIssueBody({ body: payload.body, submitter, context });

  const issue = await createIssueImpl({
    token: config.githubToken,
    repo: config.githubRepo,
    apiBase: config.githubApiBase,
    title: payload.title,
    body: issueBody,
    labels: config.issueLabels,
    fetchImpl,
  });

  const handoff = buildHandoff({
    issue,
    repo: config.githubRepo,
    title: payload.title,
    body: issueBody,
    feedback: { submitter, context },
    threshold: config.largeChangeThreshold,
  });

  const delivery = await emitHandoffImpl({
    handoff,
    webhookUrl: config.triageWebhookUrl,
    webhookSecret: config.triageWebhookSecret,
    fetchImpl,
  });

  return {
    status: 201,
    body: {
      issue: { number: issue.number, url: issue.url },
      triage: {
        classification: handoff.policy.classification,
        requires_approval: handoff.policy.requires_approval,
        delivered: delivery.delivered,
      },
    },
  };
}

/**
 * Validate a submission. Returns an array of human-readable error strings
 * (empty = valid).
 *
 * @param {any} payload
 * @returns {string[]}
 */
function validate(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return ['Request body must be a JSON object.'];
  }
  if (typeof payload.title !== 'string' || payload.title.trim() === '') {
    errors.push('`title` is required and must be a non-empty string.');
  } else if (payload.title.length > 256) {
    errors.push('`title` must be 256 characters or fewer.');
  }
  if (typeof payload.body !== 'string' || payload.body.trim() === '') {
    errors.push('`body` is required and must be a non-empty string.');
  }
  if (payload.submitter !== undefined && typeof payload.submitter !== 'string') {
    errors.push('`submitter` must be a string when provided.');
  }
  if (
    payload.context !== undefined &&
    (typeof payload.context !== 'object' || payload.context === null || Array.isArray(payload.context))
  ) {
    errors.push('`context` must be an object when provided.');
  }
  return errors;
}

/**
 * Render the GitHub issue body from a submission: the feedback text plus a
 * machine-readable context block the triage runner can parse.
 */
function renderIssueBody({ body, submitter, context }) {
  const lines = [body.trim(), '', '---', ''];
  lines.push('_Filed via the Polis Feedback plugin._');
  if (submitter) {
    lines.push(`**Submitter:** ${submitter}`);
  }
  if (context && Object.keys(context).length) {
    lines.push('', '<details><summary>Context</summary>', '', '```json');
    lines.push(JSON.stringify(context, null, 2));
    lines.push('```', '</details>');
  }
  return lines.join('\n');
}

module.exports = { handleFeedback, validate, renderIssueBody };
