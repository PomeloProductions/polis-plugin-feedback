'use strict';

/**
 * Plugin backend configuration, resolved from environment variables.
 *
 * Every value here maps 1:1 to a property in the manifest's `config_schema`
 * (see ../../plugin.json). The controller injects these as env vars when it
 * runs the plugin image, so the manifest schema and this resolver MUST stay
 * in sync.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/**
 * @typedef {Object} Config
 * @property {number} port                 HTTP port to listen on.
 * @property {string} githubToken          GitHub token with `repo`/`issues` scope.
 * @property {string} githubRepo           Target repo as "owner/name".
 * @property {string} githubApiBase        GitHub API base (overridable for GHE).
 * @property {string[]} issueLabels        Labels applied to every created issue.
 * @property {string|null} triageWebhookUrl  Where the triage handoff is POSTed.
 * @property {string|null} triageWebhookSecret  Shared secret for the handoff HMAC.
 * @property {number} largeChangeThreshold Issue-body length over which a change
 *                                         is flagged `requires_approval` for the
 *                                         triage loop. 0 disables the heuristic.
 * @property {string|null} sharedSecret    Optional bearer the frontend must send.
 */

/**
 * Build the runtime config from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Config}
 */
function loadConfig(env = process.env) {
  const prev = process.env;
  process.env = env;
  try {
    const labels = optionalEnv('FEEDBACK_ISSUE_LABELS', 'feedback')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      port: Number.parseInt(optionalEnv('PORT', '8080'), 10),
      githubToken: requireEnv('FEEDBACK_GITHUB_TOKEN'),
      githubRepo: requireEnv('FEEDBACK_GITHUB_REPO'),
      githubApiBase: optionalEnv('FEEDBACK_GITHUB_API_BASE', 'https://api.github.com'),
      issueLabels: labels,
      triageWebhookUrl: optionalEnv('FEEDBACK_TRIAGE_WEBHOOK_URL', null),
      triageWebhookSecret: optionalEnv('FEEDBACK_TRIAGE_WEBHOOK_SECRET', null),
      largeChangeThreshold: Number.parseInt(
        optionalEnv('FEEDBACK_LARGE_CHANGE_THRESHOLD', '1200'),
        10,
      ),
      sharedSecret: optionalEnv('FEEDBACK_SHARED_SECRET', null),
    };
  } finally {
    process.env = prev;
  }
}

module.exports = { loadConfig, requireEnv, optionalEnv };
