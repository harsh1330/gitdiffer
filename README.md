# gitdiffer

Share a `git diff` with a teammate via a private URL — no branch push, no PR, no Slack file dance.

> A tiny side project I built because I kept hitting the same problem.

---

## Why I built this

Whenever I had a few local changes I wanted a teammate to look at — but didn't want to push a branch yet — my options sucked:

- **Push a throwaway branch** anyway → noisy, looks half-finished, sometimes I forget to delete it.
- **Paste code in Slack** → loses structure, no way to apply it cleanly.
- **`git diff > change.patch`, send the file, ask them to `git apply`** → works, but the file dance (download, find it, run from the right directory) is annoying.

That last flow was the closest to right. So I made `gitdiffer` — basically the same idea, but the patch lives at a URL and your teammate applies it with one command.

---

## How to use it

### From the website

1. Open the site, paste the output of `git diff` (or drop a `.patch` file).
2. Pick an expiry (default 7 days).
3. Hit **Dispatch** → you get a URL, copied to your clipboard.
4. Send the URL to your teammate.
5. They open it, copy the curl one-liner shown on the page, paste in their terminal — done.

### From the CLI

```bash
# share the working tree against HEAD
npx gitdiffer share

# share a specific range
npx gitdiffer share HEAD~3..HEAD

# pipe a diff in
git diff main...feature | npx gitdiffer share -

# from an existing patch file
npx gitdiffer share --file change.patch --expires 24h

# on the receiving side
npx gitdiffer apply <id-or-url>

# preview without applying
npx gitdiffer view <id-or-url>
```

The CLI runs through `npx` so nobody on the team has to install anything.

If you want to point the CLI at a self-hosted instance:

```bash
export GITDIFFER_HOST=https://gitdiffer.mycompany.com
```

---

## What's under the hood

- **Frontend + API:** [Astro](https://astro.build) (hybrid SSR), deployed to **Netlify** with **Netlify Functions** for the API.
- **Storage:** **Netlify Blobs** — no DB to run, patches are just JSON blobs keyed by ID.
- **CLI:** plain Node 20 + TypeScript, published to npm as `gitdiffer`.
- **Shared types:** an internal `@gitdiffer/shared` workspace package keeps API and CLI in sync.

The whole thing is small enough that you can read it in an afternoon. Repo layout:

```
gitdiffer/
├── apps/web/                 # Astro app + Netlify Functions
│   ├── src/                  # pages, components, lib (id, store, validate)
│   └── netlify/functions/    # patches-create, get, raw, cleanup-expired
├── packages/cli/             # gitdiffer CLI
└── packages/shared/          # types + expiry helpers
```

---

## Limits

- **1 MB max** per patch (covers ~99% of human-authored diffs).
- **Expiry:** 1h / 24h / 7d (default) / 30d. Patches auto-delete on a daily sweep.
- **10 creates / IP / hour** — basic rate limit on the edge.
- **Privacy model:** unguessable 22-char (~131-bit) random URL. Whoever has the link can read and apply, just like a Slack/Drive "anyone with the link" share. No accounts.

---

## Local dev

```bash
git clone https://github.com/harsh1330/gitdiffer
cd gitdiffer
npm install
npm run dev      # starts netlify dev (web on :8888, astro on :4321)
```

Open `http://localhost:8888`. Hot reload is on for the web app.

Tests:

```bash
npm test         # vitest across all workspaces
```

---

## Deploy your own

1. Push the repo to GitHub.
2. On Netlify, click **Import from Git** → pick the repo.
3. Defaults from `netlify.toml` are picked up. First build provisions Netlify Blobs automatically.
4. Optional: add a custom domain. Set the CLI default in `packages/cli/src/api.ts` (or just have your team set `GITDIFFER_HOST`).

That's it — no DB, no auth provider, no env vars to configure.

---

## Roadmap (when I feel like it)

- Optional password-protected patches.
- "Burn after first apply" links.
- Account-scoped history for teams that want it.
- Self-host helper docs + a Docker image.

If you want any of these, open an issue. If you don't, that's also fine.

---

## License

MIT.

---

Built by [me](https://github.com/harsh1330) on a slow afternoon. PRs and issues welcome.
