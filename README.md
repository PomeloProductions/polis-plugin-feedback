# polis-plugin-feedback

The first real Polis plugin. An in-app **Feedback** widget that files a **GitHub
issue** and hands the issue off to a local-runner Claude **triage loop**
(PR-always; large changes need human approval).

Built to the shared Polis plugin model: a plugin is a **Docker image** (the
backend container) + a **manifest** (`plugin.json`) + a **frontend deliverable**
(a component rendered into a customizable space). The backend contract lives in
[`polis-laravel`](https://github.com/PomeloProductions/polis-laravel) (#80,
`Polis\Plugins\PluginContract`); the frontend contract in
[`polis-react`](https://github.com/PomeloProductions/polis-react) (#99,
`definePlugin` / `registerPlugin`).

## Layout

```
plugin.json              # the manifest: image + frontend deliverable + config schema
backend/                 # the Docker image — a tiny, dependency-free Node HTTP service
  src/                   #   server, handler, github client, triage handoff, config
  test/                  #   node:test suite (GitHub API always mocked)
  Dockerfile
frontend/                # the frontend deliverable — the Feedback widget
  src/FeedbackWidget.tsx #   the React component (posts to the backend)
  src/plugin.ts          #   definePlugin({ key:'feedback', components:{ 'feedback-widget': … } })
docs/triage-runner-spec.md  # the triage-loop contract (handoff schema + the two invariants)
```

## The manifest (`plugin.json`)

The shape siblings align on:

```jsonc
{
  "name": "Feedback",
  "slug": "feedback",
  "version": "0.1.0",
  "image": "ghcr.io/pomeloproductions/polis-plugin-feedback:0.1.0",
  "backend": { "port": 8080, "health": "/healthz", "routes": [ … ] },
  "frontend": [
    {
      "bundle": "feedback-widget.js",   // built artifact (frontend/dist)
      "space": "app-shell",              // customizable space to render into
      "component": "feedback-widget",    // component key registered via definePlugin
      "key": "feedback", "name": "Feedback", "version": "0.1.0"
    }
  ],
  "config_schema": { /* GitHub repo/token + triage webhook + thresholds */ }
}
```

`frontend[].component` matches the key the frontend registers
(`components['feedback-widget']`), and `key` matches the backend plugin `key`
(`feedback`) so backend/frontend identity lines up per the shared contract.

## Backend container

A minimal Node 20 HTTP service with **no runtime dependencies**
(language-agnostic by design — swappable for any image that honors the manifest
routes + config schema).

Routes:

| Method | Path            | Purpose |
|--------|-----------------|---------|
| GET    | `/healthz`      | Liveness probe (no auth). |
| POST   | `/v1/feedback`  | `{ title, body, context?, submitter? }` → creates a GitHub issue → emits the triage handoff. Returns `{ issue, triage }`. |

If `FEEDBACK_SHARED_SECRET` is set, `POST /v1/feedback` requires
`Authorization: Bearer <secret>`.

### Build & run

```sh
cd backend
docker build -t ghcr.io/pomeloproductions/polis-plugin-feedback:0.1.0 .
docker run -p 8080:8080 \
  -e FEEDBACK_GITHUB_TOKEN=ghp_… \
  -e FEEDBACK_GITHUB_REPO=owner/name \
  ghcr.io/pomeloproductions/polis-plugin-feedback:0.1.0
```

### Tests

```sh
cd backend && npm test      # node --test; the GitHub API is always mocked.
```

## Frontend deliverable

`frontend/src/plugin.ts` registers the widget via `definePlugin`:

```ts
export default definePlugin({
  key: 'feedback',
  components: { 'feedback-widget': FeedbackWidget },
});
```

The polis-react plugin renderer drops `feedback-widget` into the configured
customizable space (`app-shell`). The widget POSTs to the backend's
`/v1/feedback`. Backend URL + optional bearer are injected as props by the
controller.

```sh
cd frontend
npm install --legacy-peer-deps   # @polis/react is a private, host-provided peer
npm run test                     # vitest; fetch mocked (never hits a backend)
npm run build                    # → dist/feedback-widget.js (the manifest bundle)
```

## Configuration

Every key maps 1:1 to `plugin.json` → `config_schema` and is injected by the
controller as an env var on the backend container.

| Env var | Required | Default | Purpose |
|---------|----------|---------|---------|
| `FEEDBACK_GITHUB_TOKEN` | yes | — | Token with `repo`/`issues` scope. |
| `FEEDBACK_GITHUB_REPO` | yes | — | Target repo, `owner/name`. |
| `FEEDBACK_GITHUB_API_BASE` | no | `https://api.github.com` | Override for GHE. |
| `FEEDBACK_ISSUE_LABELS` | no | `feedback` | Comma-separated labels. |
| `FEEDBACK_TRIAGE_WEBHOOK_URL` | no | — | Where the triage handoff is POSTed; if unset the runner polls. |
| `FEEDBACK_TRIAGE_WEBHOOK_SECRET` | no | — | HMAC-SHA256 signing secret for the handoff. |
| `FEEDBACK_LARGE_CHANGE_THRESHOLD` | no | `1200` | Body length over which a change needs approval. `0` disables. |
| `FEEDBACK_SHARED_SECRET` | no | — | Bearer the widget must send to the backend. |
| `PORT` | no | `8080` | Listen port. |

## Install (through the controller)

Plugins are not deployed by hand. Submit the plugin to the platform controller
(client-driver), which builds/pushes the image through its image pipeline, reads
`plugin.json`, serves the frontend bundle into the customizable space, and
injects the config as env vars:

1. Build the frontend bundle (`cd frontend && npm run build`) — produces
   `dist/feedback-widget.js`.
2. Submit the image + `plugin.json` through the controller's plugin submission
   flow (the controller owns the GHCR push + manifest ingestion).
3. Set the config (GitHub token/repo, optional triage webhook) in the
   controller's plugin config UI (driven by `config_schema`).
4. Enable the plugin for the org/tenant.

## Triage loop

The backend's only job is **feedback → issue → handoff**. A separate
local-runner Claude loop consumes the handoff and resolves the issue under two
invariants — **PR-always** and **large-needs-approval**. The full contract
(handoff schema, signing, the invariants, the reference loop) is in
[`docs/triage-runner-spec.md`](docs/triage-runner-spec.md). Building the Claude
runner itself is out of scope for this image.
