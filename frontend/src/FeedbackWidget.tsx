import React, { useCallback, useState } from 'react';

/**
 * The Feedback widget — the frontend deliverable of the Polis Feedback plugin.
 *
 * It is registered (see ./plugin.ts) as the component `feedback-widget` and
 * rendered into a customizable space by polis-react's plugin renderer. When the
 * user submits, it POSTs to the plugin backend's `POST /v1/feedback`, which
 * files a GitHub issue and hands it off to the triage loop.
 *
 * The backend URL + optional bearer are provided at render time via props that
 * the controller injects into the bundle config (see `FeedbackWidgetProps`).
 */

export interface FeedbackWidgetProps {
  /** Base URL of the plugin backend, e.g. "https://feedback.tenant.pomeloproductions.com". */
  backendUrl?: string;
  /** Optional bearer matching the backend's FEEDBACK_SHARED_SECRET. */
  bearer?: string;
  /**
   * Extra context merged into the submission (e.g. current route, build sha,
   * org/user ids). The customizable-space renderer may supply this.
   */
  context?: Record<string, unknown>;
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'ok'; issueUrl: string } | { kind: 'error'; message: string };

/** Default backend URL: same-origin `/plugins/feedback`, overridable via props. */
const DEFAULT_BACKEND = '/plugins/feedback';

export function FeedbackWidget({ backendUrl, bearer, context }: FeedbackWidgetProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const base = (backendUrl ?? DEFAULT_BACKEND).replace(/\/$/, '');

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !body.trim()) {
        setStatus({ kind: 'error', message: 'Please provide both a title and a description.' });
        return;
      }
      setStatus({ kind: 'sending' });
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (bearer) headers.Authorization = `Bearer ${bearer}`;

        const res = await fetch(`${base}/v1/feedback`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            submitter: undefined,
            context: {
              url: typeof window !== 'undefined' ? window.location.href : undefined,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
              ...context,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Submission failed (${res.status}). ${text}`.trim());
        }
        const data = (await res.json()) as { issue?: { url?: string } };
        setStatus({ kind: 'ok', issueUrl: data.issue?.url ?? '' });
        setTitle('');
        setBody('');
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      }
    },
    [base, bearer, title, body, context],
  );

  if (!open) {
    return (
      <button type="button" className="polis-feedback-fab" onClick={() => setOpen(true)} aria-label="Send feedback">
        Feedback
      </button>
    );
  }

  return (
    <div className="polis-feedback-panel" role="dialog" aria-label="Send feedback">
      <div className="polis-feedback-header">
        <strong>Send feedback</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>

      {status.kind === 'ok' ? (
        <div className="polis-feedback-success">
          <p>Thanks — your feedback was filed.</p>
          {status.issueUrl ? (
            <a href={status.issueUrl} target="_blank" rel="noreferrer">
              View issue
            </a>
          ) : null}
          <button type="button" onClick={() => setStatus({ kind: 'idle' })}>
            Send more
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="polis-feedback-form">
          <label>
            Title
            <input
              type="text"
              value={title}
              maxLength={256}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={body}
              rows={5}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened? What did you expect?"
              required
            />
          </label>
          {status.kind === 'error' ? <p className="polis-feedback-error">{status.message}</p> : null}
          <button type="submit" disabled={status.kind === 'sending'}>
            {status.kind === 'sending' ? 'Sending…' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  );
}

export default FeedbackWidget;
