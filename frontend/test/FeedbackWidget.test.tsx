import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackWidget } from '../src/FeedbackWidget';

describe('FeedbackWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the form when the trigger is clicked', () => {
    render(<FeedbackWidget backendUrl="https://backend.test" />);
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(screen.getByRole('dialog', { name: /send feedback/i })).toBeInTheDocument();
  });

  it('posts the submission to the backend and shows the created issue link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issue: { url: 'https://github.com/o/r/issues/5' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<FeedbackWidget backendUrl="https://backend.test/" bearer="s3cret" context={{ org: 'org-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Broken button' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'It does nothing.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/your feedback was filed/i)).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.test/v1/feedback');
    expect(opts.headers.Authorization).toBe('Bearer s3cret');
    const sent = JSON.parse(opts.body);
    expect(sent.title).toBe('Broken button');
    expect(sent.body).toBe('It does nothing.');
    expect(sent.context.org).toBe('org-1');
    expect(screen.getByRole('link', { name: /view issue/i })).toHaveAttribute(
      'href',
      'https://github.com/o/r/issues/5',
    );
  });

  it('surfaces a backend error without crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'upstream_error' });
    vi.stubGlobal('fetch', fetchMock);

    render(<FeedbackWidget backendUrl="https://backend.test" />);
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/submission failed \(502\)/i)).toBeInTheDocument());
  });

  it('validates required fields before calling the backend', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<FeedbackWidget backendUrl="https://backend.test" />);
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    // Fire submit on the form directly to bypass native required-attr blocking.
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/provide both a title and a description/i)).toBeInTheDocument();
  });
});

describe('plugin definition', () => {
  it('registers the feedback-widget component under key "feedback"', async () => {
    const mod = await import('../src/plugin');
    const def = mod.default as { key: string; components: Record<string, unknown> };
    expect(def.key).toBe('feedback');
    expect(def.components['feedback-widget']).toBeDefined();
  });
});
