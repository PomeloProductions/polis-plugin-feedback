'use strict';

/**
 * Thin GitHub Issues client.
 *
 * Only the single call this plugin needs (create an issue). Uses the injected
 * `fetch` so tests can mock it and NEVER touch the live GitHub API. Node 18+
 * provides a global `fetch`, which is the production default.
 */

/**
 * @typedef {Object} CreatedIssue
 * @property {number} number   The issue number.
 * @property {string} url      The html_url of the issue.
 * @property {string} apiUrl   The API url of the issue.
 */

/**
 * Create a GitHub issue in the configured repository.
 *
 * @param {Object} opts
 * @param {string} opts.token       GitHub token.
 * @param {string} opts.repo        "owner/name".
 * @param {string} opts.apiBase     API base URL.
 * @param {string} opts.title       Issue title.
 * @param {string} opts.body        Issue body (markdown).
 * @param {string[]} [opts.labels]  Labels to apply.
 * @param {typeof fetch} [opts.fetchImpl=fetch]  Injected fetch (for tests).
 * @returns {Promise<CreatedIssue>}
 */
async function createIssue(opts) {
  const { token, repo, apiBase, title, body, labels = [], fetchImpl = fetch } = opts;

  if (!/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error(`Invalid repo "${repo}" — expected "owner/name"`);
  }

  const url = `${apiBase.replace(/\/$/, '')}/repos/${repo}/issues`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'polis-plugin-feedback',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`GitHub issue creation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { number: data.number, url: data.html_url, apiUrl: data.url };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '<unreadable body>';
  }
}

module.exports = { createIssue };
