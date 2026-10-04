'use strict';

const crypto = require('crypto');

/**
 * The triage-loop handoff contract.
 *
 * When this plugin turns a piece of feedback into a GitHub issue, it emits a
 * single "triage handoff" event. A local-runner Claude loop consumes that event
 * and attempts to resolve the issue. The contract — NOT the runner itself — is
 * what this plugin owns. The runner is specified in ../../docs/triage-runner-spec.md
 * and is out of scope for this image.
 *
 * ── Handoff payload (versioned: schema "polis.feedback.triage/v1") ──
 *   {
 *     schema: "polis.feedback.triage/v1",
 *     event:  "issue.triage.requested",
 *     issue:  { number, url, repo, title },
 *     feedback: { submitter, context },
 *     policy: {
 *       // The two hard rules of the triage loop:
 *       pr_always: true,             // the runner NEVER pushes to a default
 *                                    // branch; every change lands as a PR.
 *       requires_approval: boolean,  // when true, a human must approve the PR
 *                                    // before it may be merged/auto-merged.
 *       classification: "small" | "large",
 *       reason: string,              // why it was classified large (if so)
 *     },
 *     emitted_at: ISO-8601,
 *   }
 *
 * ── Delivery ──
 *   POSTed as JSON to `config.triageWebhookUrl`. If a `triageWebhookSecret` is
 *   set, an `X-Polis-Signature: sha256=<hex>` header carries the HMAC-SHA256 of
 *   the raw body so the runner can authenticate the handoff. If no webhook URL
 *   is configured, the handoff is returned to the caller (and logged) rather
 *   than delivered — useful for local/dev where the runner polls instead.
 *
 * ── The two invariants the runner MUST honor ──
 *   1. PR-always: the runner opens a pull request for every change. It never
 *      commits directly to a protected/default branch.
 *   2. Large-needs-approval: if `policy.requires_approval` is true, the runner
 *      must leave the PR for a human to approve (no auto-merge). Small changes
 *      may be auto-merged by the runner's own policy.
 */

const TRIAGE_SCHEMA = 'polis.feedback.triage/v1';

/**
 * Classify a feedback-derived issue as "small" or "large" for the triage loop.
 *
 * The heuristic is deliberately simple and overridable: body length over
 * `threshold`, or an explicit `large`/`requires_approval` hint in the context.
 * The runner itself re-evaluates scope once it has repo context; this is only
 * the initial gate so obviously-big asks never auto-merge.
 *
 * @param {Object} opts
 * @param {string} opts.body
 * @param {Object} [opts.context]
 * @param {number} opts.threshold  0 disables the length heuristic.
 * @returns {{ classification: 'small'|'large', requiresApproval: boolean, reason: string }}
 */
function classify(opts) {
  const { body, context = {}, threshold } = opts;

  if (context.requires_approval === true || context.severity === 'large') {
    return {
      classification: 'large',
      requiresApproval: true,
      reason: 'explicitly flagged large / requires_approval by submitter context',
    };
  }

  if (threshold > 0 && typeof body === 'string' && body.length > threshold) {
    return {
      classification: 'large',
      requiresApproval: true,
      reason: `feedback body length ${body.length} exceeds large-change threshold ${threshold}`,
    };
  }

  return {
    classification: 'small',
    requiresApproval: false,
    reason: 'within small-change threshold — runner may auto-merge per its policy',
  };
}

/**
 * Build the versioned triage handoff payload for a created issue.
 *
 * @param {Object} opts
 * @param {import('./github').CreatedIssue} opts.issue
 * @param {string} opts.repo
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {Object} opts.feedback   { submitter, context }
 * @param {number} opts.threshold
 * @returns {Object} the handoff payload
 */
function buildHandoff(opts) {
  const { issue, repo, title, body, feedback, threshold } = opts;
  const policy = classify({ body, context: feedback.context, threshold });

  return {
    schema: TRIAGE_SCHEMA,
    event: 'issue.triage.requested',
    issue: { number: issue.number, url: issue.url, repo, title },
    feedback: { submitter: feedback.submitter || null, context: feedback.context || {} },
    policy: {
      pr_always: true,
      requires_approval: policy.requiresApproval,
      classification: policy.classification,
      reason: policy.reason,
    },
    emitted_at: new Date().toISOString(),
  };
}

/**
 * Sign a raw JSON body with HMAC-SHA256 → "sha256=<hex>".
 *
 * @param {string} rawBody
 * @param {string} secret
 * @returns {string}
 */
function sign(rawBody, secret) {
  const mac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${mac}`;
}

/**
 * Emit the triage handoff. Delivers to the configured webhook if present;
 * otherwise returns `{ delivered: false }` so the caller can log/return it.
 *
 * @param {Object} opts
 * @param {Object} opts.handoff
 * @param {string|null} opts.webhookUrl
 * @param {string|null} opts.webhookSecret
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @returns {Promise<{ delivered: boolean, status?: number }>}
 */
async function emitHandoff(opts) {
  const { handoff, webhookUrl, webhookSecret, fetchImpl = fetch } = opts;

  if (!webhookUrl) {
    return { delivered: false };
  }

  const rawBody = JSON.stringify(handoff);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'polis-plugin-feedback',
  };
  if (webhookSecret) {
    headers['X-Polis-Signature'] = sign(rawBody, webhookSecret);
  }

  const res = await fetchImpl(webhookUrl, { method: 'POST', headers, body: rawBody });
  return { delivered: res.ok, status: res.status };
}

module.exports = { TRIAGE_SCHEMA, classify, buildHandoff, sign, emitHandoff };
