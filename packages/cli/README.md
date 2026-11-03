# gitdiffer

Share a `git diff` with a teammate via a private URL — no branch push, no PR, no Slack file dance.

```bash
# you
npx gitdiffer share
# ✓ Patch shared (expires in 7d)
#   https://polite-tanuki-d0250a.netlify.app/p/h7K9mPq2vN3xR8tB4cYwLs  (copied to clipboard)

# your teammate
npx gitdiffer apply h7K9mPq2vN3xR8tB4cYwLs
```

Nothing to install — it runs through `npx`. Requires Node 20+ and git.

## Commands

```bash
npx gitdiffer share                          # working tree vs HEAD
npx gitdiffer share HEAD~3..HEAD             # any git diff args
git diff main...feature | npx gitdiffer share -   # from stdin
npx gitdiffer share --file change.patch      # from a patch file
npx gitdiffer share --expires 24h            # 1h | 24h | 7d (default) | 30d

npx gitdiffer apply <id-or-url>              # apply to your working tree
npx gitdiffer view  <id-or-url>              # print the diff without applying
```

## When `apply` can't apply cleanly

Plain `git apply` says "patch does not apply" for several different reasons. `gitdiffer apply` works out which one and tells you:

| Situation | What gitdiffer does |
|---|---|
| You already have the change | Says it's already applied and exits successfully |
| You have **uncommitted** edits on the same lines | Stops without touching your files — commit or `git stash`, then retry |
| You're on a different commit, edits nearby | Applies with a 3-way merge |
| You're on a different commit, edits on the same lines | Applies with conflict markers for you to resolve |
| Your files don't match at all | Tells you you're likely on a different commit than the sender |

If you're unsure, `npx gitdiffer view <id>` shows exactly what will change.

## Self-hosting

Point the CLI at your own instance:

```bash
export GITDIFFER_HOST=https://gitdiffer.mycompany.com
```

## Limits

- 1 MB max per patch
- Patches auto-delete after their expiry
- Anyone with the link can read the patch (unguessable 22-char ID, no accounts)

## Links

- Web app: https://polite-tanuki-d0250a.netlify.app
- Source & self-hosting guide: https://github.com/harsh1330/gitdiffer
- Issues: https://github.com/harsh1330/gitdiffer/issues

MIT licensed.
