# gitdiffer — Design Spec

**Date:** 2026-05-01
**Status:** Approved (pending final user review)

## 1. Problem

Sharing in-progress local code changes with a teammate today usually means one of:

- Pushing a branch you don't actually want to publish.
- Pasting code into Slack and losing structure.
- Doing `git diff > change.patch`, sending the file, and asking the receiver to run `git apply change.patch`.

The patch-file workflow is the closest to right, but it's clunky: you upload a file, the receiver downloads it, navigates to it, and runs an apply command from the right directory.

`gitdiffer` makes that flow one click on each side.

## 2. Goals (v1)

- Sender can create a shareable URL for a `git diff` in seconds, from a web page or a CLI.
- Receiver can view the diff in the browser (file-by-file, syntax highlighted) and apply it with a single copy-pasted command, or with the same CLI.
- Hosted on Netlify with no extra infra (no DB, no auth provider).

## 3. Non-goals (explicitly out of scope for v1)

- Comments, inline annotations, or any review/discussion features.
- Editing a patch after creation.
- Accounts, dashboards, or "my patches" lists.
- Email or webhook notifications.
- Password protection on patches (left as a clean future extension).
- Burn-after-reading single-view links.

## 4. User flows

### 4.1 Sender — web

1. Visit `/`.
2. Either paste `git diff` output into a textarea, or drag-and-drop a `.patch` / `.diff` / `.txt` file onto the form.
3. Pick expiry from a dropdown: **1h / 24h / 7d (default) / 30d**.
4. Submit → redirected to `/p/:id`, which displays the shareable URL with a copy button, expiry, and the rendered diff.

### 4.2 Sender — CLI

```bash
# Default: diff working tree against HEAD
npx gitdiffer share

# A specific range
npx gitdiffer share HEAD~3..HEAD

# Pipe stdin
git diff main...feature | npx gitdiffer share -

# From a file
npx gitdiffer share --file change.patch

# Custom expiry
npx gitdiffer share --expires 24h
```

On success the CLI prints the URL and copies it to the clipboard when a clipboard is available (gracefully degrades when not).

### 4.3 Receiver — web (`/p/:id`)

- Header: patch ID, "expires in X", small mailto-based "report" link.
- **Apply commands panel** at top, with tabs and copy buttons:
  - `curl` one-liner: `curl -s https://<host>/api/patches/<id>/raw | git apply -`
  - `gitdiffer` CLI: `npx gitdiffer apply <id>`
  - Download `.patch` file
- **Diff viewer** below: rendered with `diff2html`, file-by-file, with a toggle between unified and side-by-side. Collapsible per file.
- Stats: N files changed, +X / −Y lines.

**Error states:**
- Unknown ID → 404 page with a "the link may be wrong" message.
- Expired → 410 page: "This patch expired on YYYY-MM-DD. Ask the sender to reshare."
- Diff fails to parse cleanly in `diff2html` → fall back to a plain `<pre>` block with a small warning banner.

**No-JS fallback:** the page server-renders patch metadata and the raw diff inside `<pre>` so the page is usable without JS; `diff2html` enhances on top when JS runs.

### 4.4 Receiver — CLI

```bash
npx gitdiffer apply <id-or-url>     # runs git apply
npx gitdiffer view <id-or-url>      # prints diff to stdout, no apply
```

`apply` shells out to `git apply`, propagates non-zero exits, and surfaces conflicts cleanly.

## 5. Architecture

### 5.1 Stack

- **Frontend:** Astro 4.x (static-first, Netlify-friendly), Tailwind 3.x for styling, minimal client JS.
- **API:** Netlify Functions (TypeScript) co-located in the Astro app.
- **Storage:** Netlify Blobs (built-in key-value, no schema, no ops).
- **CLI:** Node.js 20+, TypeScript, distributed via `npx gitdiffer` and `npm i -g gitdiffer`.

Choosing Netlify Blobs over a real DB is deliberate: the data is just text plus a tiny envelope, and avoiding an external DB keeps deployment to "connect repo to Netlify" with zero extra wiring.

### 5.2 Routes

| Route                       | Method | Purpose                                                       |
| --------------------------- | ------ | ------------------------------------------------------------- |
| `/`                         | GET    | Create page (paste / drop a diff)                             |
| `/p/:id`                    | GET    | Viewer page (server-rendered shell, client-enhanced)          |
| `/api/patches`              | POST   | Create a patch. Body: `{ diff: string, expires_in: string }`. Returns `{ id, url, expires_at }`. |
| `/api/patches/:id`          | GET    | Returns JSON `{ id, diff, created_at, expires_at, size_bytes }`. |
| `/api/patches/:id/raw`      | GET    | Returns raw diff as `text/plain`. Used by the curl one-liner and the CLI. |
| `cleanup-expired` (scheduled) | —    | Netlify scheduled function (no public route). Runs daily, scans Blobs, deletes those with `expires_at < now`. |

### 5.3 Data model

A single Blob per patch, keyed by ID, value is JSON:

```json
{
  "id": "h7K9mPq2vN3xR8tB4cYwLs",
  "diff": "<raw git diff text>",
  "created_at": "2026-05-01T18:00:00Z",
  "expires_at": "2026-05-08T18:00:00Z",
  "size_bytes": 4231
}
```

### 5.4 IDs

22-character base62 (`[A-Za-z0-9]`) string, generated from `crypto.randomBytes`. ~131 bits of entropy — effectively unguessable, short enough to type or paste comfortably.

### 5.5 Limits

- **Max diff size:** 1 MB. Anything larger is rejected with a 413 and a clear message.
- **Expiry options:** 1h / 24h / 7d (default) / 30d. Server validates against this allow-list.
- **Rate limit:** 10 creates per IP per hour, enforced in a Netlify Edge Function. Best-effort, not airtight.

### 5.6 Expiry handling

Netlify Blobs has no native TTL, so:

- Reads check `expires_at`. Expired blobs return **410 Gone** with a "this patch expired" page or JSON.
- A scheduled function (`/api/cleanup`) runs daily and deletes blobs where `expires_at < now`. Even if it lags, reads are still safe because they re-check.

### 5.7 Privacy & access model

Unguessable URL only. No passwords, no auth, no enumeration endpoints. Matches the "Slack file link" mental model. The schema leaves room to add an optional `password_hash` field later without rearchitecting.

## 6. Components

### 6.1 Web

- `PatchForm` — textarea + drag-and-drop file input + expiry dropdown + submit. Posts to `/api/patches`, redirects on success.
- `DiffViewer` — wraps `diff2html`, takes raw diff text, supports unified/side-by-side toggle, collapsible per file.
- `ApplyCommandsPanel` — tabbed UI with copy buttons for curl / CLI / download.
- `ExpiryBadge` — humanized "expires in 6 days" with absolute timestamp on hover.

### 6.2 API (Netlify Functions)

- `patches-create.ts` — validates body (size, expiry value), generates ID, writes Blob, returns metadata.
- `patches-get.ts` — reads Blob, checks expiry, returns JSON or 404/410.
- `patches-raw.ts` — same but returns `text/plain`.
- `cleanup-expired.ts` — scheduled, deletes expired blobs.

### 6.3 CLI

- `commands/share.ts` — resolves source (args / stdin / `--file`), runs `git diff` when needed via `child_process`, validates size, POSTs to API, prints + copies URL.
- `commands/apply.ts` — fetches raw diff from API, pipes to `git apply`, surfaces errors.
- `commands/view.ts` — fetches raw diff and prints to stdout.
- `api.ts` — small typed client wrapping `fetch`. Reads `GITDIFFER_HOST` env var (defaults to the production host).

### 6.4 Shared types

`packages/shared/src/types.ts` holds request/response interfaces (`CreatePatchRequest`, `CreatePatchResponse`, `PatchRecord`, `ExpiryOption`) so the API and CLI can't drift.

## 7. Repository layout

```
gitdiffer/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── pages/
│       │   │   ├── index.astro
│       │   │   └── p/[id].astro
│       │   ├── components/
│       │   │   ├── PatchForm.astro
│       │   │   ├── DiffViewer.astro
│       │   │   ├── ApplyCommandsPanel.astro
│       │   │   └── ExpiryBadge.astro
│       │   └── lib/
│       │       ├── id.ts
│       │       ├── store.ts
│       │       └── validate.ts
│       ├── netlify/
│       │   └── functions/
│       │       ├── patches-create.ts
│       │       ├── patches-get.ts
│       │       ├── patches-raw.ts
│       │       └── cleanup-expired.ts
│       ├── astro.config.mjs
│       └── package.json
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── commands/
│   │   │   │   ├── share.ts
│   │   │   │   ├── apply.ts
│   │   │   │   └── view.ts
│   │   │   └── api.ts
│   │   └── package.json
│   └── shared/
│       ├── src/types.ts
│       └── package.json
├── netlify.toml
├── package.json              # npm workspaces root
├── tsconfig.base.json
└── README.md
```

## 8. Deployment

- Repo connected to Netlify. Push to `main` → build `apps/web` → live.
- `netlify.toml` declares the build command, publish directory, functions directory, and the scheduled function.
- CLI published to npm manually from `packages/cli` for v1. Changesets-based automation can come later.

## 9. Testing

- **API:** Vitest unit tests with `@netlify/blobs` stubbed; cover create / get / expired / oversize / malformed.
- **CLI:** integration tests against a local `netlify dev` server; cover share-from-stdin, share-from-file, apply, view, and not-found.
- **Web:** one Playwright smoke test that paints the create page, posts a small diff, and renders the viewer.
- No coverage threshold. Aim for happy paths + the named error cases.

## 10. Tech versions

- Node 20 LTS
- TypeScript 5.x
- Astro 4.x
- Tailwind 3.x
- `diff2html` 3.x
- `@netlify/blobs` latest at build time

## 11. Future extensions (deliberately deferred)

- Optional password protection (`password_hash` field already implied in the schema).
- Burn-after-reading single-view links.
- Account-scoped patch lists for teams that want history.
- Self-host helper docs and a Docker image.
- Diff comments / review threading.
