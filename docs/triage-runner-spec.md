# Triage runner specification

The Feedback plugin's backend ends its job the moment it emits a **triage
handoff** (see `backend/src/triage.js`). A separate, out-of-band **local-runner
Claude loop** consumes that handoff and attempts to resolve the issue. This
document specifies the contract that runner must honor. The runner itself is
**not** part of this repository's image — only the contract and the trigger are.

## Handoff event

The backend emits one event per created issue. Schema: `polis.feedback.triage/v1`.

```jsonc
{
  "schema": "polis.feedback.triage/v1",
  "event": "issue.triage.requested",
  "issue": {
    "number": 42,
    "url": "https://github.com/owner/name/issues/42",
    "repo": "owner/name",
    "title": "…"
  },
  "feedback": {
    "submitter": "alice@example.com | null",
    "context": { "url": "/dashboard", "build": "sha-abc", "…": "…" }
  },
  "policy": {
    "pr_always": true,          // ALWAYS true — invariant 1
    "requires_approval": false, // true for large changes — invariant 2
    "classification": "small",  // "small" | "large"
    "reason": "…"               // why it was classified this way
  },
  "emitted_at": "2026-10-04T00:00:00.000Z"
}
```

### Delivery

- **Webhook (push):** if `FEEDBACK_TRIAGE_WEBHOOK_URL` is set, the handoff is
  `POST`ed there as JSON. If `FEEDBACK_TRIAGE_WEBHOOK_SECRET` is set, the request
  carries `X-Polis-Signature: sha256=<hmac>` — HMAC-SHA256 of the **raw request
  body**. The runner MUST verify this before acting.
- **Poll (pull):** if no webhook is configured, the backend does not deliver.
  The runner is expected to poll the target repo for issues labelled
  `feedback` (configurable via `FEEDBACK_ISSUE_LABELS`) that it has not yet
  processed. The issue body carries the same `context` block in a fenced
  `json` section for parity.

## The two invariants

The runner MUST honor both, regardless of how it resolves an issue:

1. **PR-always.** Every change the runner makes lands as a pull request. The
   runner NEVER commits to a protected/default branch. No exceptions — even a
   one-character fix opens a PR.

2. **Large-needs-approval.** When `policy.requires_approval` is `true`, the
   runner leaves the PR **for a human to approve**. It must not auto-merge and
   must not enable auto-merge. When `false` (small change), the runner MAY
   auto-merge per its own policy once checks pass.

The backend sets `requires_approval` via a conservative initial heuristic
(body length over `FEEDBACK_LARGE_CHANGE_THRESHOLD`, or an explicit
`context.requires_approval` / `context.severity: "large"` hint). The runner
re-evaluates scope once it has repository context and MUST escalate (never
de-escalate) to `requires_approval` if its own analysis finds the change large,
risky, or touching sensitive areas.

## Expected runner loop (reference)

1. Receive/verify handoff (or discover a labelled issue when polling).
2. Create a working branch off the default branch.
3. Have Claude read the issue + context, make the change, and run the repo's
   checks locally.
4. Open a PR referencing the issue (`Closes #<number>`).
5. If `requires_approval` is `true`: request human review; stop. Otherwise: wait
   for CI; auto-merge if green and within the runner's small-change policy.
6. Comment back on the issue with the PR link and the classification.

## Trigger endpoint (what this plugin implements)

This plugin implements the **issue creation + handoff emission** only:

- `POST /v1/feedback` on the backend container → creates the issue → emits the
  handoff. This is the single integration point the runner builds on.

A full Claude runner is intentionally out of scope here; it is a separate
deployable that subscribes to (or polls for) the handoff described above.
