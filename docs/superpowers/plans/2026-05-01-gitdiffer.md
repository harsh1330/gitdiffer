# gitdiffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Netlify-hosted patch-sharing service (web + CLI) that lets a developer turn a local `git diff` into a shareable URL, and a teammate apply it with one command.

**Architecture:** Astro frontend + Netlify Functions backed by Netlify Blobs for storage. A small TypeScript CLI (`npx gitdiffer`) talks to the same JSON API. Shared types live in a workspace package so the API and CLI cannot drift.

**Tech Stack:** Node 20, TypeScript 5, Astro 4, Tailwind 3, `@netlify/blobs`, `diff2html`, Vitest, Playwright.

> **Note on git commits during execution of this plan in the current session:** The user has asked Claude not to run `git` commands in this project dir for now. Skip the literal `git add` / `git commit` steps below when executing in this session — the project will be committed by the user. Keep them in the plan as the canonical "what would be committed and when" markers.

---

## File Structure

**Top-level (created by Task 1):**
- `package.json` — workspaces root.
- `tsconfig.base.json` — shared TS config.
- `netlify.toml` — build + functions + scheduled functions config.
- `.gitignore`, `.editorconfig`, `.nvmrc`.
- `README.md` — usage docs.

**`packages/shared/`:**
- `src/types.ts` — `ExpiryOption`, `CreatePatchRequest`, `CreatePatchResponse`, `PatchRecord`, `ApiError`.
- `src/expiry.ts` — pure helpers to parse expiry options and compute `expires_at`.
- `package.json`, `tsconfig.json`.

**`apps/web/`:**
- `src/pages/index.astro` — create page (form + drag/drop).
- `src/pages/p/[id].astro` — viewer page (server-rendered shell + client enhance).
- `src/components/PatchForm.astro`
- `src/components/DiffViewer.astro`
- `src/components/ApplyCommandsPanel.astro`
- `src/components/ExpiryBadge.astro`
- `src/lib/id.ts` — `generateId()`.
- `src/lib/store.ts` — Blobs wrapper (`putPatch`, `getPatch`, `deletePatch`, `listExpired`).
- `src/lib/validate.ts` — diff size + expiry validation.
- `netlify/functions/patches-create.ts`
- `netlify/functions/patches-get.ts`
- `netlify/functions/patches-raw.ts`
- `netlify/functions/cleanup-expired.ts`
- `netlify/edge-functions/rate-limit.ts`
- `astro.config.mjs`, `tailwind.config.mjs`, `tsconfig.json`, `package.json`.

**`packages/cli/`:**
- `src/index.ts` — entry, arg parsing.
- `src/api.ts` — typed HTTP client.
- `src/commands/share.ts`
- `src/commands/apply.ts`
- `src/commands/view.ts`
- `src/util/git.ts` — small wrapper around `git diff`.
- `src/util/clipboard.ts` — best-effort clipboard write.
- `package.json`, `tsconfig.json`, `bin/gitdiffer.js`.

**Tests** are colocated under each package's `test/` folder.

---

## Task 1: Initialize the monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`

- [ ] **Step 1: Create `package.json` at the repo root**

```json
{
  "name": "gitdiffer",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "dev": "npm --workspace apps/web run dev"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules
dist
.netlify
.astro
.env
.env.*
!.env.example
*.log
```

- [ ] **Step 4: Create `.nvmrc`**

```
20
```

- [ ] **Step 5: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .nvmrc .editorconfig
git commit -m "chore: initialize monorepo with workspaces"
```

---

## Task 2: Shared package (types + expiry helpers, with tests)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/expiry.ts`
- Create: `packages/shared/test/expiry.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@gitdiffer/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/types.ts`**

```ts
export const EXPIRY_OPTIONS = ["1h", "24h", "7d", "30d"] as const;
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

export interface CreatePatchRequest {
  diff: string;
  expires_in: ExpiryOption;
}

export interface CreatePatchResponse {
  id: string;
  url: string;
  expires_at: string; // ISO-8601
}

export interface PatchRecord {
  id: string;
  diff: string;
  created_at: string; // ISO-8601
  expires_at: string; // ISO-8601
  size_bytes: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export const MAX_DIFF_BYTES = 1024 * 1024; // 1 MB
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export * from "./types.js";
export * from "./expiry.js";
```

- [ ] **Step 5: Write failing test for expiry helper**

Create `packages/shared/test/expiry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeExpiresAt, isExpired, EXPIRY_DURATIONS_MS } from "../src/expiry.js";

describe("computeExpiresAt", () => {
  it("adds 1 hour for '1h'", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    expect(computeExpiresAt("1h", now)).toBe("2026-05-01T01:00:00.000Z");
  });

  it("adds 7 days for '7d'", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    expect(computeExpiresAt("7d", now)).toBe("2026-05-08T00:00:00.000Z");
  });
});

describe("isExpired", () => {
  it("returns true when expires_at is in the past", () => {
    expect(isExpired("2020-01-01T00:00:00Z", new Date("2026-05-01T00:00:00Z"))).toBe(true);
  });

  it("returns false when expires_at is in the future", () => {
    expect(isExpired("2030-01-01T00:00:00Z", new Date("2026-05-01T00:00:00Z"))).toBe(false);
  });
});

describe("EXPIRY_DURATIONS_MS", () => {
  it("includes all options", () => {
    expect(Object.keys(EXPIRY_DURATIONS_MS).sort()).toEqual(["1h", "24h", "30d", "7d"]);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm install
npm --workspace @gitdiffer/shared test
```

Expected: FAIL — module `expiry.js` does not exist.

- [ ] **Step 7: Implement `packages/shared/src/expiry.ts`**

```ts
import type { ExpiryOption } from "./types.js";

export const EXPIRY_DURATIONS_MS: Record<ExpiryOption, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function computeExpiresAt(option: ExpiryOption, now: Date = new Date()): string {
  return new Date(now.getTime() + EXPIRY_DURATIONS_MS[option]).toISOString();
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm --workspace @gitdiffer/shared test
```

Expected: PASS — 5 tests, all green.

- [ ] **Step 9: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add types and expiry helpers"
```

---

## Task 3: Astro web app skeleton with Tailwind

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/astro.config.mjs`
- Create: `apps/web/tailwind.config.mjs`
- Create: `apps/web/src/layouts/Base.astro`
- Create: `apps/web/src/pages/index.astro`
- Create: `apps/web/src/styles/global.css`
- Create: `netlify.toml`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@gitdiffer/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "netlify dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@astrojs/netlify": "^5.0.0",
    "@astrojs/tailwind": "^5.1.0",
    "@gitdiffer/shared": "*",
    "@netlify/blobs": "^7.0.0",
    "astro": "^4.5.0",
    "diff2html": "^3.4.48",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "@netlify/functions": "^2.6.0",
    "netlify-cli": "^17.0.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@gitdiffer/shared": ["../../packages/shared/src/index.ts"]
    }
  }
}
```

- [ ] **Step 3: Create `apps/web/astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "hybrid",
  adapter: netlify(),
  integrations: [tailwind({ applyBaseStyles: false })],
});
```

- [ ] **Step 4: Create `apps/web/tailwind.config.mjs`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d1117",
        panel: "#161b22",
        border: "#30363d",
        text: "#e6edf3",
        muted: "#8b949e",
        accent: "#2f81f7",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `apps/web/src/styles/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { background: theme(colors.bg); color: theme(colors.text); }
body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
code, pre { font-family: theme(fontFamily.mono); }
```

- [ ] **Step 6: Create `apps/web/src/layouts/Base.astro`**

```astro
---
import "../styles/global.css";
const { title = "gitdiffer" } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body class="min-h-screen">
    <header class="border-b border-border">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/" class="text-lg font-semibold">gitdiffer</a>
        <span class="text-muted text-sm">share a patch, no branch needed</span>
      </div>
    </header>
    <main class="max-w-5xl mx-auto px-4 py-8">
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 7: Create a placeholder `apps/web/src/pages/index.astro`**

```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="gitdiffer">
  <h1 class="text-2xl font-semibold mb-4">Share a git diff</h1>
  <p class="text-muted">Form coming next.</p>
</Base>
```

- [ ] **Step 8: Create `netlify.toml` at repo root**

```toml
[build]
  base = "apps/web"
  command = "npm run build"
  publish = "apps/web/dist"

[functions]
  directory = "apps/web/netlify/functions"
  node_bundler = "esbuild"

[[edge_functions]]
  path = "/api/patches"
  function = "rate-limit"

[functions."cleanup-expired"]
  schedule = "@daily"
```

- [ ] **Step 9: Install + sanity build**

```bash
npm install
npm --workspace @gitdiffer/web run build
```

Expected: Astro build succeeds, `apps/web/dist/` produced.

- [ ] **Step 10: Commit**

```bash
git add apps/web netlify.toml package.json package-lock.json
git commit -m "feat(web): scaffold Astro app with Tailwind and Netlify adapter"
```

---

## Task 4: ID generator (TDD)

**Files:**
- Create: `apps/web/src/lib/id.ts`
- Create: `apps/web/test/id.test.ts`

- [ ] **Step 1: Write failing test**

`apps/web/test/id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateId, ID_LENGTH, ID_ALPHABET } from "../src/lib/id";

describe("generateId", () => {
  it("returns a 22-char base62 string", () => {
    const id = generateId();
    expect(id).toHaveLength(ID_LENGTH);
    expect(ID_LENGTH).toBe(22);
    for (const ch of id) {
      expect(ID_ALPHABET).toContain(ch);
    }
  });

  it("produces unique values across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateId());
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL — `id.ts` does not exist.

- [ ] **Step 3: Implement `apps/web/src/lib/id.ts`**

```ts
import { randomBytes } from "node:crypto";

export const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const ID_LENGTH = 22;

export function generateId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/id.ts apps/web/test/id.test.ts
git commit -m "feat(web): add base62 ID generator"
```

---

## Task 5: Validation utilities (TDD)

**Files:**
- Create: `apps/web/src/lib/validate.ts`
- Create: `apps/web/test/validate.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateCreateRequest } from "../src/lib/validate";

describe("validateCreateRequest", () => {
  it("accepts a valid request", () => {
    const result = validateCreateRequest({ diff: "diff --git a/x b/x\n", expires_in: "7d" });
    expect(result.ok).toBe(true);
  });

  it("rejects missing diff", () => {
    const result = validateCreateRequest({ diff: "", expires_in: "7d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("empty_diff");
  });

  it("rejects oversize diff", () => {
    const big = "a".repeat(1024 * 1024 + 1);
    const result = validateCreateRequest({ diff: big, expires_in: "7d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("diff_too_large");
  });

  it("rejects invalid expiry", () => {
    const result = validateCreateRequest({ diff: "x", expires_in: "999y" as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("invalid_expiry");
  });

  it("rejects non-string diff", () => {
    const result = validateCreateRequest({ diff: 42 as never, expires_in: "7d" });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/src/lib/validate.ts`**

```ts
import {
  EXPIRY_OPTIONS,
  MAX_DIFF_BYTES,
  type CreatePatchRequest,
  type ApiError,
} from "@gitdiffer/shared";

type Result =
  | { ok: true; value: CreatePatchRequest }
  | { ok: false; error: ApiError; status: number };

export function validateCreateRequest(input: unknown): Result {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      status: 400,
      error: { error: "invalid_body", message: "Request body must be a JSON object." },
    };
  }
  const { diff, expires_in } = input as Record<string, unknown>;
  if (typeof diff !== "string") {
    return {
      ok: false,
      status: 400,
      error: { error: "invalid_diff", message: "Field 'diff' must be a string." },
    };
  }
  if (diff.length === 0) {
    return {
      ok: false,
      status: 400,
      error: { error: "empty_diff", message: "Diff is empty." },
    };
  }
  if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES) {
    return {
      ok: false,
      status: 413,
      error: { error: "diff_too_large", message: "Diff exceeds 1 MB limit." },
    };
  }
  if (typeof expires_in !== "string" || !EXPIRY_OPTIONS.includes(expires_in as never)) {
    return {
      ok: false,
      status: 400,
      error: {
        error: "invalid_expiry",
        message: `Field 'expires_in' must be one of ${EXPIRY_OPTIONS.join(", ")}.`,
      },
    };
  }
  return { ok: true, value: { diff, expires_in: expires_in as CreatePatchRequest["expires_in"] } };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validate.ts apps/web/test/validate.test.ts
git commit -m "feat(web): add request validation"
```

---

## Task 6: Blobs store wrapper (TDD with stubbed Blobs)

**Files:**
- Create: `apps/web/src/lib/store.ts`
- Create: `apps/web/test/store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeBlobs = new Map<string, string>();
const getStore = vi.fn(() => ({
  set: vi.fn(async (k: string, v: string) => { fakeBlobs.set(k, v); }),
  get: vi.fn(async (k: string) => fakeBlobs.get(k) ?? null),
  delete: vi.fn(async (k: string) => { fakeBlobs.delete(k); }),
  list: vi.fn(async () => ({ blobs: [...fakeBlobs.keys()].map((key) => ({ key })) })),
}));

vi.mock("@netlify/blobs", () => ({ getStore }));

import { putPatch, getPatch, deletePatch, listPatchKeys } from "../src/lib/store";

beforeEach(() => fakeBlobs.clear());

describe("store", () => {
  it("round-trips a patch record", async () => {
    await putPatch({
      id: "abc",
      diff: "hello",
      created_at: "2026-05-01T00:00:00Z",
      expires_at: "2026-05-08T00:00:00Z",
      size_bytes: 5,
    });
    const got = await getPatch("abc");
    expect(got?.diff).toBe("hello");
  });

  it("returns null for unknown id", async () => {
    expect(await getPatch("nope")).toBeNull();
  });

  it("deletes a patch", async () => {
    await putPatch({
      id: "abc",
      diff: "x",
      created_at: "x",
      expires_at: "x",
      size_bytes: 1,
    });
    await deletePatch("abc");
    expect(await getPatch("abc")).toBeNull();
  });

  it("lists keys", async () => {
    await putPatch({
      id: "a",
      diff: "x",
      created_at: "x",
      expires_at: "x",
      size_bytes: 1,
    });
    expect(await listPatchKeys()).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/src/lib/store.ts`**

```ts
import { getStore } from "@netlify/blobs";
import type { PatchRecord } from "@gitdiffer/shared";

const STORE_NAME = "patches";

function patches() {
  return getStore(STORE_NAME);
}

export async function putPatch(record: PatchRecord): Promise<void> {
  await patches().set(record.id, JSON.stringify(record));
}

export async function getPatch(id: string): Promise<PatchRecord | null> {
  const raw = await patches().get(id);
  if (!raw) return null;
  return JSON.parse(typeof raw === "string" ? raw : await raw.text()) as PatchRecord;
}

export async function deletePatch(id: string): Promise<void> {
  await patches().delete(id);
}

export async function listPatchKeys(): Promise<string[]> {
  const result = await patches().list();
  return result.blobs.map((b: { key: string }) => b.key);
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/store.ts apps/web/test/store.test.ts
git commit -m "feat(web): add Netlify Blobs store wrapper"
```

---

## Task 7: `POST /api/patches` function (TDD)

**Files:**
- Create: `apps/web/netlify/functions/patches-create.ts`
- Create: `apps/web/test/patches-create.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeBlobs = new Map<string, string>();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    set: async (k: string, v: string) => { fakeBlobs.set(k, v); },
    get: async (k: string) => fakeBlobs.get(k) ?? null,
    delete: async (k: string) => { fakeBlobs.delete(k); },
    list: async () => ({ blobs: [...fakeBlobs.keys()].map((key) => ({ key })) }),
  }),
}));

import handler from "../netlify/functions/patches-create";

beforeEach(() => fakeBlobs.clear());

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/patches", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/patches", () => {
  it("creates a patch and returns id + url", async () => {
    const res = await handler(req({ diff: "diff --git a/x b/x\n+hi\n", expires_in: "7d" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^[A-Za-z0-9]{22}$/);
    expect(body.url).toContain(body.id);
    expect(typeof body.expires_at).toBe("string");
    expect(fakeBlobs.size).toBe(1);
  });

  it("rejects empty diff with 400", async () => {
    const res = await handler(req({ diff: "", expires_in: "7d" }));
    expect(res.status).toBe(400);
  });

  it("rejects oversize diff with 413", async () => {
    const res = await handler(req({ diff: "a".repeat(1024 * 1024 + 1), expires_in: "7d" }));
    expect(res.status).toBe(413);
  });

  it("rejects bad expiry with 400", async () => {
    const res = await handler(req({ diff: "x", expires_in: "999y" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-JSON body with 400", async () => {
    const res = await handler(req("not json"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/netlify/functions/patches-create.ts`**

```ts
import type { CreatePatchResponse, PatchRecord } from "@gitdiffer/shared";
import { computeExpiresAt } from "@gitdiffer/shared";
import { generateId } from "../../src/lib/id";
import { putPatch } from "../../src/lib/store";
import { validateCreateRequest } from "../../src/lib/validate";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Use POST." }, 405);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body", message: "Body must be valid JSON." }, 400);
  }
  const result = validateCreateRequest(body);
  if (!result.ok) return json(result.error, result.status);

  const id = generateId();
  const now = new Date();
  const record: PatchRecord = {
    id,
    diff: result.value.diff,
    created_at: now.toISOString(),
    expires_at: computeExpiresAt(result.value.expires_in, now),
    size_bytes: Buffer.byteLength(result.value.diff, "utf8"),
  };
  await putPatch(record);

  const origin = new URL(req.url).origin;
  const response: CreatePatchResponse = {
    id,
    url: `${origin}/p/${id}`,
    expires_at: record.expires_at,
  };
  return json(response, 201);
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/patches" };
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/netlify/functions/patches-create.ts apps/web/test/patches-create.test.ts
git commit -m "feat(api): POST /api/patches creates patches"
```

---

## Task 8: `GET /api/patches/:id` and `/raw` (TDD)

**Files:**
- Create: `apps/web/netlify/functions/patches-get.ts`
- Create: `apps/web/netlify/functions/patches-raw.ts`
- Create: `apps/web/test/patches-get.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeBlobs = new Map<string, string>();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    set: async (k: string, v: string) => { fakeBlobs.set(k, v); },
    get: async (k: string) => fakeBlobs.get(k) ?? null,
    delete: async (k: string) => { fakeBlobs.delete(k); },
    list: async () => ({ blobs: [...fakeBlobs.keys()].map((key) => ({ key })) }),
  }),
}));

import getHandler from "../netlify/functions/patches-get";
import rawHandler from "../netlify/functions/patches-raw";
import { putPatch } from "../src/lib/store";

beforeEach(() => fakeBlobs.clear());

const fixture = (overrides: Partial<{ expires_at: string; id: string; diff: string }> = {}) => ({
  id: overrides.id ?? "abc",
  diff: overrides.diff ?? "diff --git a/x b/x\n",
  created_at: "2026-05-01T00:00:00Z",
  expires_at: overrides.expires_at ?? "2999-01-01T00:00:00Z",
  size_bytes: (overrides.diff ?? "diff --git a/x b/x\n").length,
});

describe("GET /api/patches/:id", () => {
  it("returns the record as JSON", async () => {
    await putPatch(fixture());
    const res = await getHandler(new Request("http://localhost/api/patches/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff).toBe("diff --git a/x b/x\n");
  });

  it("returns 404 when missing", async () => {
    const res = await getHandler(new Request("http://localhost/api/patches/missing"), { params: { id: "missing" } });
    expect(res.status).toBe(404);
  });

  it("returns 410 when expired", async () => {
    await putPatch(fixture({ expires_at: "2000-01-01T00:00:00Z" }));
    const res = await getHandler(new Request("http://localhost/api/patches/abc"), { params: { id: "abc" } });
    expect(res.status).toBe(410);
  });
});

describe("GET /api/patches/:id/raw", () => {
  it("returns text/plain diff", async () => {
    await putPatch(fixture());
    const res = await rawHandler(new Request("http://localhost/api/patches/abc/raw"), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("diff --git a/x b/x\n");
  });

  it("returns 410 when expired", async () => {
    await putPatch(fixture({ expires_at: "2000-01-01T00:00:00Z" }));
    const res = await rawHandler(new Request("http://localhost/api/patches/abc/raw"), { params: { id: "abc" } });
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/netlify/functions/patches-get.ts`**

```ts
import { isExpired } from "@gitdiffer/shared";
import { getPatch } from "../../src/lib/store";

interface Ctx { params: { id: string } }

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await getPatch(ctx.params.id);
  if (!record) return json({ error: "not_found", message: "Unknown patch ID." }, 404);
  if (isExpired(record.expires_at)) {
    return json({ error: "expired", message: "Patch has expired.", expired_at: record.expires_at }, 410);
  }
  return json(record, 200);
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/patches/:id" };
```

- [ ] **Step 4: Implement `apps/web/netlify/functions/patches-raw.ts`**

```ts
import { isExpired } from "@gitdiffer/shared";
import { getPatch } from "../../src/lib/store";

interface Ctx { params: { id: string } }

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await getPatch(ctx.params.id);
  if (!record) {
    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }
  if (isExpired(record.expires_at)) {
    return new Response("expired\n", { status: 410, headers: { "content-type": "text/plain" } });
  }
  return new Response(record.diff, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = { path: "/api/patches/:id/raw" };
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/netlify/functions/patches-get.ts apps/web/netlify/functions/patches-raw.ts apps/web/test/patches-get.test.ts
git commit -m "feat(api): add GET /api/patches/:id and /raw"
```

---

## Task 9: Scheduled cleanup function

**Files:**
- Create: `apps/web/netlify/functions/cleanup-expired.ts`
- Create: `apps/web/test/cleanup.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeBlobs = new Map<string, string>();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    set: async (k: string, v: string) => { fakeBlobs.set(k, v); },
    get: async (k: string) => fakeBlobs.get(k) ?? null,
    delete: async (k: string) => { fakeBlobs.delete(k); },
    list: async () => ({ blobs: [...fakeBlobs.keys()].map((key) => ({ key })) }),
  }),
}));

import handler from "../netlify/functions/cleanup-expired";
import { putPatch, getPatch } from "../src/lib/store";

beforeEach(() => fakeBlobs.clear());

describe("cleanup-expired", () => {
  it("deletes expired patches and keeps fresh ones", async () => {
    await putPatch({
      id: "old",
      diff: "x",
      created_at: "2020-01-01T00:00:00Z",
      expires_at: "2020-01-02T00:00:00Z",
      size_bytes: 1,
    });
    await putPatch({
      id: "new",
      diff: "x",
      created_at: "2026-05-01T00:00:00Z",
      expires_at: "2999-01-01T00:00:00Z",
      size_bytes: 1,
    });
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await getPatch("old")).toBeNull();
    expect(await getPatch("new")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace @gitdiffer/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/netlify/functions/cleanup-expired.ts`**

```ts
import { isExpired } from "@gitdiffer/shared";
import { deletePatch, getPatch, listPatchKeys } from "../../src/lib/store";

export default async function handler(): Promise<Response> {
  const keys = await listPatchKeys();
  let deleted = 0;
  for (const key of keys) {
    const record = await getPatch(key);
    if (record && isExpired(record.expires_at)) {
      await deletePatch(key);
      deleted++;
    }
  }
  return new Response(JSON.stringify({ deleted, scanned: keys.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const config = { schedule: "@daily" };
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace @gitdiffer/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/netlify/functions/cleanup-expired.ts apps/web/test/cleanup.test.ts
git commit -m "feat(api): add scheduled cleanup of expired patches"
```

---

## Task 10: Edge function for rate limiting

**Files:**
- Create: `apps/web/netlify/edge-functions/rate-limit.ts`

- [ ] **Step 1: Implement the edge function (no tests — runs in Deno-like env, smoke-tested via deploy)**

```ts
const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 10;

export default async (request: Request, context: { ip?: string; next: () => Promise<Response> }) => {
  if (request.method !== "POST") return context.next();
  const ip = context.ip ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.reset < now) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return context.next();
  }
  if (bucket.count >= LIMIT) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many patches. Try again later." }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }
  bucket.count++;
  return context.next();
};

export const config = { path: "/api/patches" };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/netlify/edge-functions/rate-limit.ts
git commit -m "feat(api): add per-IP rate limit on POST /api/patches"
```

---

## Task 11: PatchForm component (create page)

**Files:**
- Create: `apps/web/src/components/PatchForm.astro`
- Modify: `apps/web/src/pages/index.astro`

- [ ] **Step 1: Create `apps/web/src/components/PatchForm.astro`**

```astro
---
import { EXPIRY_OPTIONS } from "@gitdiffer/shared";
---
<form id="patch-form" class="space-y-4">
  <div
    id="dropzone"
    class="border border-dashed border-border rounded-lg bg-panel p-4 text-sm text-muted">
    Drop a <code>.patch</code> / <code>.diff</code> / <code>.txt</code> file here, or paste below.
  </div>

  <textarea
    id="diff"
    name="diff"
    rows="14"
    placeholder="Paste the output of `git diff` here..."
    class="w-full rounded-lg bg-panel border border-border p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
    required></textarea>

  <div class="flex items-center gap-3">
    <label for="expires_in" class="text-sm text-muted">Expires in</label>
    <select
      id="expires_in"
      name="expires_in"
      class="bg-panel border border-border rounded px-2 py-1 text-sm">
      {EXPIRY_OPTIONS.map((opt) => (
        <option value={opt} selected={opt === "7d"}>{opt}</option>
      ))}
    </select>
    <button
      type="submit"
      class="ml-auto bg-accent hover:opacity-90 text-white text-sm font-medium px-4 py-2 rounded">
      Share
    </button>
  </div>

  <p id="error" class="text-red-400 text-sm hidden"></p>
</form>

<script>
  const form = document.getElementById("patch-form") as HTMLFormElement;
  const diff = document.getElementById("diff") as HTMLTextAreaElement;
  const expires = document.getElementById("expires_in") as HTMLSelectElement;
  const errorEl = document.getElementById("error") as HTMLParagraphElement;
  const dropzone = document.getElementById("dropzone") as HTMLDivElement;

  function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  ["dragover", "dragenter"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("border-accent", "text-accent");
    }),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, () => {
      dropzone.classList.remove("border-accent", "text-accent");
    }),
  );
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    diff.value = await file.text();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const res = await fetch("/api/patches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diff: diff.value, expires_in: expires.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Something went wrong." }));
      showError(body.message ?? "Something went wrong.");
      return;
    }
    const body = await res.json();
    location.assign(`/p/${body.id}`);
  });
</script>
```

- [ ] **Step 2: Replace `apps/web/src/pages/index.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import PatchForm from "../components/PatchForm.astro";
---
<Base title="gitdiffer — share a git diff">
  <h1 class="text-2xl font-semibold mb-2">Share a git diff</h1>
  <p class="text-muted mb-6">
    Run <code>git diff</code>, paste the output, and send the link.
    Your teammate applies it with one command.
  </p>
  <PatchForm />
</Base>
```

- [ ] **Step 3: Smoke-test the build**

```bash
npm --workspace @gitdiffer/web run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/PatchForm.astro apps/web/src/pages/index.astro
git commit -m "feat(web): create page with paste + drag-and-drop form"
```

---

## Task 12: Viewer page (`/p/[id]`) with apply panel + diff viewer

**Files:**
- Create: `apps/web/src/components/ApplyCommandsPanel.astro`
- Create: `apps/web/src/components/DiffViewer.astro`
- Create: `apps/web/src/components/ExpiryBadge.astro`
- Create: `apps/web/src/pages/p/[id].astro`

- [ ] **Step 1: Create `apps/web/src/components/ExpiryBadge.astro`**

```astro
---
const { expiresAt } = Astro.props as { expiresAt: string };
const expiry = new Date(expiresAt);
const now = new Date();
const ms = expiry.getTime() - now.getTime();
const hours = Math.floor(ms / (60 * 60 * 1000));
const days = Math.floor(hours / 24);
const human = ms <= 0
  ? "expired"
  : days >= 1
    ? `expires in ${days} day${days === 1 ? "" : "s"}`
    : `expires in ${hours} hour${hours === 1 ? "" : "s"}`;
---
<span title={expiresAt} class="text-xs text-muted">{human}</span>
```

- [ ] **Step 2: Create `apps/web/src/components/ApplyCommandsPanel.astro`**

```astro
---
const { id, origin } = Astro.props as { id: string; origin: string };
const curl = `curl -s ${origin}/api/patches/${id}/raw | git apply -`;
const cli = `npx gitdiffer apply ${id}`;
const dl = `${origin}/api/patches/${id}/raw`;
---
<div class="border border-border rounded-lg bg-panel divide-y divide-border">
  <div class="flex items-center gap-2 px-3 py-2 text-sm">
    <button data-tab="curl" class="tab text-accent">curl</button>
    <button data-tab="cli" class="tab text-muted">gitdiffer CLI</button>
    <a href={dl} download={`${id}.patch`} class="ml-auto text-muted hover:text-text">Download .patch</a>
  </div>
  <div class="p-3">
    <pre data-pane="curl" class="text-sm font-mono whitespace-pre-wrap break-all">{curl}</pre>
    <pre data-pane="cli" class="text-sm font-mono whitespace-pre-wrap break-all hidden">{cli}</pre>
    <button id="copy-cmd" class="mt-3 text-xs px-2 py-1 border border-border rounded hover:bg-bg">
      Copy command
    </button>
    <span id="copy-status" class="ml-2 text-xs text-muted"></span>
  </div>
</div>

<script>
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const panes = document.querySelectorAll<HTMLPreElement>("[data-pane]");
  let active: "curl" | "cli" = "curl";
  tabs.forEach((btn) =>
    btn.addEventListener("click", () => {
      active = (btn.dataset.tab as "curl" | "cli") ?? "curl";
      tabs.forEach((b) => b.classList.toggle("text-accent", b.dataset.tab === active));
      tabs.forEach((b) => b.classList.toggle("text-muted", b.dataset.tab !== active));
      panes.forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== active));
    }),
  );
  document.getElementById("copy-cmd")?.addEventListener("click", async () => {
    const text = document.querySelector<HTMLPreElement>(`[data-pane="${active}"]`)?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      const status = document.getElementById("copy-status");
      if (status) {
        status.textContent = "copied";
        setTimeout(() => (status.textContent = ""), 1500);
      }
    } catch {
      /* clipboard not available */
    }
  });
</script>
```

- [ ] **Step 3: Create `apps/web/src/components/DiffViewer.astro`**

```astro
---
const { diff } = Astro.props as { diff: string };
---
<div id="diff-host" data-diff={diff}>
  <noscript>
    <pre class="font-mono text-xs whitespace-pre overflow-x-auto p-3 bg-panel border border-border rounded">{diff}</pre>
  </noscript>
  <pre id="diff-fallback" class="font-mono text-xs whitespace-pre overflow-x-auto p-3 bg-panel border border-border rounded">{diff}</pre>
  <div id="diff-rendered" class="hidden"></div>
  <p id="diff-warning" class="text-xs text-yellow-400 mt-2 hidden">
    Could not render structured diff; showing raw text.
  </p>
</div>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.48/bundles/css/diff2html.min.css" />
<script type="module">
  import { Diff2HtmlUI } from "https://cdn.jsdelivr.net/npm/diff2html@3.4.48/bundles/js/diff2html-ui-base.min.js";
  const host = document.getElementById("diff-host");
  const target = document.getElementById("diff-rendered");
  const fallback = document.getElementById("diff-fallback");
  const warn = document.getElementById("diff-warning");
  const diff = host?.dataset.diff ?? "";
  try {
    const ui = new Diff2HtmlUI(target, diff, { drawFileList: true, outputFormat: "side-by-side" });
    ui.draw();
    fallback?.classList.add("hidden");
    target?.classList.remove("hidden");
  } catch (e) {
    warn?.classList.remove("hidden");
  }
</script>
```

- [ ] **Step 4: Create `apps/web/src/pages/p/[id].astro`**

```astro
---
import Base from "../../layouts/Base.astro";
import ApplyCommandsPanel from "../../components/ApplyCommandsPanel.astro";
import DiffViewer from "../../components/DiffViewer.astro";
import ExpiryBadge from "../../components/ExpiryBadge.astro";
import { getPatch } from "../../lib/store";
import { isExpired } from "@gitdiffer/shared";

export const prerender = false;

const { id } = Astro.params;
if (!id) return Astro.redirect("/", 302);

const record = await getPatch(id);
const status: "ok" | "missing" | "expired" = !record
  ? "missing"
  : isExpired(record.expires_at)
    ? "expired"
    : "ok";

const origin = new URL(Astro.request.url).origin;
---
<Base title={`gitdiffer — ${id}`}>
  {status === "missing" && (
    <div class="text-center py-16">
      <h1 class="text-xl font-semibold mb-2">Patch not found</h1>
      <p class="text-muted">The link may be wrong or the patch was deleted.</p>
    </div>
  )}

  {status === "expired" && (
    <div class="text-center py-16">
      <h1 class="text-xl font-semibold mb-2">This patch expired</h1>
      <p class="text-muted">Ask the sender to share a fresh link.</p>
    </div>
  )}

  {status === "ok" && record && (
    <>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-lg font-mono">{id}</h1>
        <ExpiryBadge expiresAt={record.expires_at} />
      </div>

      <div class="mb-6">
        <ApplyCommandsPanel id={id} origin={origin} />
      </div>

      <DiffViewer diff={record.diff} />
    </>
  )}
</Base>
```

Set the response status to 404/410 when applicable by replacing the early frontmatter logic with an `Astro.response.status = ...` line right before rendering. Update accordingly:

```astro
if (status === "missing") Astro.response.status = 404;
else if (status === "expired") Astro.response.status = 410;
```

(Add this directly above the `const origin = ...` line in the frontmatter.)

- [ ] **Step 5: Smoke-test build**

```bash
npm --workspace @gitdiffer/web run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components apps/web/src/pages/p
git commit -m "feat(web): viewer page with apply commands and diff2html"
```

---

## Task 13: CLI scaffold + `share` command (TDD)

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/api.ts`
- Create: `packages/cli/src/util/git.ts`
- Create: `packages/cli/src/util/clipboard.ts`
- Create: `packages/cli/src/commands/share.ts`
- Create: `packages/cli/test/share.test.ts`
- Create: `packages/cli/bin/gitdiffer.js`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "gitdiffer",
  "version": "0.0.1",
  "description": "Share a git diff via a one-time URL.",
  "type": "module",
  "bin": { "gitdiffer": "bin/gitdiffer.js" },
  "files": ["bin", "dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@gitdiffer/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/cli/bin/gitdiffer.js`**

```js
#!/usr/bin/env node
import("../dist/index.js").then((m) => m.main(process.argv.slice(2)));
```

(Add an executable bit when committing if your platform requires it.)

- [ ] **Step 4: Create `packages/cli/src/util/git.ts`**

```ts
import { execFileSync } from "node:child_process";

export function runGitDiff(args: string[] = []): string {
  return execFileSync("git", ["diff", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
```

- [ ] **Step 5: Create `packages/cli/src/util/clipboard.ts`**

```ts
import { spawn } from "node:child_process";

export async function copyToClipboard(text: string): Promise<boolean> {
  const cmds: Array<[string, string[]]> = [
    ["pbcopy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["wl-copy", []],
    ["clip.exe", []],
  ];
  for (const [cmd, args] of cmds) {
    const ok = await tryWrite(cmd, args, text);
    if (ok) return true;
  }
  return false;
}

function tryWrite(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}
```

- [ ] **Step 6: Create `packages/cli/src/api.ts`**

```ts
import type { CreatePatchRequest, CreatePatchResponse, PatchRecord } from "@gitdiffer/shared";

const DEFAULT_HOST = "https://gitdiffer.app";

function host(): string {
  return process.env.GITDIFFER_HOST ?? DEFAULT_HOST;
}

export async function createPatch(req: CreatePatchRequest): Promise<CreatePatchResponse> {
  const res = await fetch(`${host()}/api/patches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`gitdiffer: ${body.message ?? res.statusText}`);
  }
  return (await res.json()) as CreatePatchResponse;
}

export async function fetchPatchRaw(idOrUrl: string): Promise<string> {
  const id = extractId(idOrUrl);
  const res = await fetch(`${host()}/api/patches/${id}/raw`);
  if (res.status === 404) throw new Error("gitdiffer: patch not found.");
  if (res.status === 410) throw new Error("gitdiffer: patch has expired.");
  if (!res.ok) throw new Error(`gitdiffer: HTTP ${res.status}`);
  return res.text();
}

export function extractId(input: string): string {
  const m = input.match(/[A-Za-z0-9]{22}/);
  if (!m) throw new Error("gitdiffer: could not parse patch id from input.");
  return m[0];
}
```

- [ ] **Step 7: Create `packages/cli/src/commands/share.ts`**

```ts
import { readFileSync } from "node:fs";
import type { ExpiryOption } from "@gitdiffer/shared";
import { EXPIRY_OPTIONS } from "@gitdiffer/shared";
import { runGitDiff } from "../util/git.js";
import { copyToClipboard } from "../util/clipboard.js";
import { createPatch } from "../api.js";

interface ShareOptions {
  source: { kind: "git"; gitArgs: string[] } | { kind: "stdin" } | { kind: "file"; path: string };
  expiresIn: ExpiryOption;
}

export async function share(opts: ShareOptions, stdin: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const diff = await readSource(opts.source, stdin);
  if (!diff.trim()) throw new Error("gitdiffer: no diff to share (input is empty).");
  const result = await createPatch({ diff, expires_in: opts.expiresIn });
  return result.url;
}

async function readSource(source: ShareOptions["source"], stdin: NodeJS.ReadableStream): Promise<string> {
  if (source.kind === "git") return runGitDiff(source.gitArgs);
  if (source.kind === "file") return readFileSync(source.path, "utf8");
  return readStream(stdin);
}

function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (buf += chunk));
    stream.on("end", () => resolve(buf));
    stream.on("error", reject);
  });
}

export function parseShareArgs(argv: string[]): ShareOptions {
  let expiresIn: ExpiryOption = "7d";
  let file: string | null = null;
  let stdinFlag = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--expires" || arg === "-e") {
      const next = argv[++i];
      if (!next || !EXPIRY_OPTIONS.includes(next as never)) {
        throw new Error(`--expires must be one of ${EXPIRY_OPTIONS.join(", ")}`);
      }
      expiresIn = next as ExpiryOption;
    } else if (arg === "--file" || arg === "-f") {
      file = argv[++i] ?? null;
      if (!file) throw new Error("--file requires a path");
    } else if (arg === "-") {
      stdinFlag = true;
    } else {
      positional.push(arg);
    }
  }

  const source: ShareOptions["source"] =
    file !== null
      ? { kind: "file", path: file }
      : stdinFlag
        ? { kind: "stdin" }
        : { kind: "git", gitArgs: positional };

  return { source, expiresIn };
}
```

- [ ] **Step 8: Create `packages/cli/src/index.ts`**

```ts
import { parseShareArgs, share } from "./commands/share.js";
import { copyToClipboard } from "./util/clipboard.js";

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "share") {
      const opts = parseShareArgs(rest);
      const url = await share(opts);
      const copied = await copyToClipboard(url);
      console.log(`✓ Patch shared (expires in ${opts.expiresIn})`);
      console.log(`  ${url}${copied ? "  (copied to clipboard)" : ""}`);
      return;
    }
    if (cmd === "apply" || cmd === "view") {
      const { runApplyOrView } = await import("./commands/apply.js");
      await runApplyOrView(cmd, rest);
      return;
    }
    printUsage();
    process.exit(cmd ? 1 : 0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`gitdiffer — share a git diff via URL

Usage:
  gitdiffer share [git-args...] [--expires 1h|24h|7d|30d]
  gitdiffer share -                       (read diff from stdin)
  gitdiffer share --file change.patch
  gitdiffer apply <id-or-url>
  gitdiffer view  <id-or-url>

Env:
  GITDIFFER_HOST   override the API host (default: https://gitdiffer.app)
`);
}
```

- [ ] **Step 9: Write failing test for share + parseShareArgs**

`packages/cli/test/share.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";

vi.mock("../src/api.js", () => ({
  createPatch: vi.fn(async (req) => ({
    id: "h7K9mPq2vN3xR8tB4cYwLs",
    url: "https://gitdiffer.app/p/h7K9mPq2vN3xR8tB4cYwLs",
    expires_at: "2026-05-08T00:00:00Z",
  })),
  fetchPatchRaw: vi.fn(),
  extractId: vi.fn((s: string) => s),
}));

import { share, parseShareArgs } from "../src/commands/share.js";
import { createPatch } from "../src/api.js";

describe("parseShareArgs", () => {
  it("defaults expiry to 7d and source to git", () => {
    expect(parseShareArgs([])).toEqual({ source: { kind: "git", gitArgs: [] }, expiresIn: "7d" });
  });
  it("parses --expires", () => {
    expect(parseShareArgs(["--expires", "24h"])).toEqual({
      source: { kind: "git", gitArgs: [] },
      expiresIn: "24h",
    });
  });
  it("parses stdin", () => {
    expect(parseShareArgs(["-"])).toEqual({ source: { kind: "stdin" }, expiresIn: "7d" });
  });
  it("parses --file", () => {
    expect(parseShareArgs(["--file", "x.patch"])).toEqual({
      source: { kind: "file", path: "x.patch" },
      expiresIn: "7d",
    });
  });
  it("rejects bad expiry", () => {
    expect(() => parseShareArgs(["--expires", "999y"])).toThrow();
  });
});

describe("share", () => {
  it("reads stdin and posts to API", async () => {
    const stdin = Readable.from(["diff --git a/x b/x\n+hi\n"]);
    const url = await share({ source: { kind: "stdin" }, expiresIn: "7d" }, stdin);
    expect(url).toContain("/p/");
    expect(createPatch).toHaveBeenCalledWith({
      diff: "diff --git a/x b/x\n+hi\n",
      expires_in: "7d",
    });
  });

  it("throws on empty input", async () => {
    const stdin = Readable.from([""]);
    await expect(share({ source: { kind: "stdin" }, expiresIn: "7d" }, stdin)).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 10: Run to verify it passes**

```bash
npm --workspace gitdiffer test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): scaffold + share command with stdin/file/git sources"
```

---

## Task 14: CLI `apply` and `view` commands (TDD)

**Files:**
- Create: `packages/cli/src/commands/apply.ts`
- Create: `packages/cli/test/apply.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/api.js", () => ({
  fetchPatchRaw: vi.fn(async (id: string) => {
    if (id.includes("missing")) throw new Error("gitdiffer: patch not found.");
    return "diff --git a/x b/x\n+hi\n";
  }),
  extractId: (s: string) => s,
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execFileSync: vi.fn(),
}));

import { runApplyOrView } from "../src/commands/apply.js";

describe("runApplyOrView", () => {
  it("view prints the diff to stdout", async () => {
    const log = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runApplyOrView("view", ["abc"]);
    expect(log).toHaveBeenCalledWith("diff --git a/x b/x\n+hi\n");
    log.mockRestore();
  });

  it("apply pipes diff into git apply", async () => {
    const stdin = { write: vi.fn(), end: vi.fn() };
    const proc = {
      stdin,
      on: (evt: string, cb: (code: number) => void) => evt === "close" && cb(0),
    };
    spawnMock.mockReturnValue(proc);
    await runApplyOrView("apply", ["abc"]);
    expect(spawnMock).toHaveBeenCalledWith("git", ["apply"], expect.any(Object));
    expect(stdin.write).toHaveBeenCalledWith("diff --git a/x b/x\n+hi\n");
    expect(stdin.end).toHaveBeenCalled();
  });

  it("apply throws on missing", async () => {
    await expect(runApplyOrView("apply", ["missingxxxxxxxxxxxxxx"])).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm --workspace gitdiffer test
```

Expected: FAIL.

- [ ] **Step 3: Implement `packages/cli/src/commands/apply.ts`**

```ts
import { spawn } from "node:child_process";
import { fetchPatchRaw } from "../api.js";

export async function runApplyOrView(cmd: "apply" | "view", argv: string[]): Promise<void> {
  const target = argv[0];
  if (!target) throw new Error(`gitdiffer: usage: gitdiffer ${cmd} <id-or-url>`);
  const diff = await fetchPatchRaw(target);

  if (cmd === "view") {
    process.stdout.write(diff);
    return;
  }

  await runGitApply(diff);
}

function runGitApply(diff: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["apply"], { stdio: ["pipe", "inherit", "inherit"] });
    proc.on("error", (err) => reject(new Error(`gitdiffer: failed to spawn git: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gitdiffer: git apply exited with code ${code}`));
    });
    proc.stdin.write(diff);
    proc.stdin.end();
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --workspace gitdiffer test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/apply.ts packages/cli/test/apply.test.ts
git commit -m "feat(cli): add apply and view commands"
```

---

## Task 15: Playwright smoke test for create → view

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add Playwright dev dep + script**

Modify `apps/web/package.json`:

```json
"scripts": {
  "dev": "netlify dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "vitest run",
  "test:e2e": "playwright test"
},
"devDependencies": {
  "@netlify/functions": "^2.6.0",
  "@playwright/test": "^1.43.0",
  "netlify-cli": "^17.0.0",
  "vitest": "^1.5.0"
}
```

Then `npm install`.

- [ ] **Step 2: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npx netlify dev --port 8888",
    port: 8888,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:8888" },
});
```

- [ ] **Step 3: Create `apps/web/e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("create then view a patch", async ({ page }) => {
  await page.goto("/");
  await page.locator("#diff").fill("diff --git a/x b/x\nindex 0..1\n--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+hello\n");
  await page.getByRole("button", { name: "Share" }).click();
  await page.waitForURL(/\/p\/[A-Za-z0-9]{22}$/);
  await expect(page.locator("text=expires in")).toBeVisible();
  await expect(page.locator("text=curl")).toBeVisible();
});
```

- [ ] **Step 4: Run smoke test**

```bash
npm --workspace @gitdiffer/web exec playwright install chromium
npm --workspace @gitdiffer/web run test:e2e
```

Expected: PASS — single test green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/smoke.spec.ts apps/web/package.json package-lock.json
git commit -m "test(web): add Playwright smoke test for create→view"
```

---

## Task 16: README + deploy notes

**Files:**
- Create: `README.md`
- Create: `apps/web/.env.example`

- [ ] **Step 1: Create `README.md`**

````md
# gitdiffer

Share a `git diff` with a teammate via a URL — no branch push required.

## How it works

1. You run `gitdiffer share` (or paste your diff at the website).
2. You get a URL.
3. Your teammate runs the curl one-liner shown on the page, or `gitdiffer apply <id>`.

## Web

Hosted at the URL you deploy to (Netlify). Open `/`, paste a diff, get a link.

## CLI

```bash
npx gitdiffer share                     # default: working tree vs HEAD, 7d
npx gitdiffer share HEAD~3..HEAD        # share a specific range
git diff main...feature | npx gitdiffer share -
npx gitdiffer share --file change.patch --expires 24h
npx gitdiffer apply <id-or-url>
npx gitdiffer view  <id-or-url>
```

Set `GITDIFFER_HOST` to point the CLI at a self-hosted instance.

## Local dev

```bash
npm install
npm run dev   # runs `netlify dev` for the web app
```

## Deploy (Netlify)

1. Push the repo to GitHub.
2. Connect it to Netlify; defaults from `netlify.toml` are picked up.
3. The first build provisions Netlify Blobs automatically.
4. Set a custom domain if you want (`gitdiffer.example.com`) and update the CLI default `GITDIFFER_HOST` accordingly.

## Limits

- 1 MB max diff size.
- Expiry: 1h / 24h / 7d (default) / 30d.
- 10 creates per IP per hour.
````

- [ ] **Step 2: Create `apps/web/.env.example`**

```
# No required env vars in v1.
# GITDIFFER_HOST is read by the CLI, not the web app.
```

- [ ] **Step 3: Commit**

```bash
git add README.md apps/web/.env.example
git commit -m "docs: add README and .env example"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Covered by |
| -- | -- |
| Sender web flow | Task 11 |
| Sender CLI | Task 13 |
| Receiver web | Task 12 |
| Receiver CLI | Task 14 |
| Architecture / stack | Tasks 1, 3 |
| Routes | Tasks 7, 8, 9, 12 |
| Data model + IDs | Tasks 4, 6, 7 |
| Limits (size, expiry, rate) | Tasks 5, 7, 10 |
| Expiry handling | Tasks 2, 8, 9 |
| Privacy (unguessable URL) | Task 4 |
| Error states (404 / 410 / parse fallback) | Tasks 8, 12 |
| Repo layout | Tasks 1, 2, 3, 13 |
| Deployment | Tasks 3, 16 |
| Testing strategy | Tasks 4, 5, 6, 7, 8, 9, 13, 14, 15 |

**2. Placeholder scan:** none found.

**3. Type consistency:** `PatchRecord`, `CreatePatchRequest`, `CreatePatchResponse`, `ExpiryOption`, `ApiError` all defined in Task 2 and used consistently in Tasks 5–14. Function names (`generateId`, `validateCreateRequest`, `putPatch`, `getPatch`, `deletePatch`, `listPatchKeys`, `createPatch`, `fetchPatchRaw`, `extractId`, `share`, `runApplyOrView`, `parseShareArgs`) are stable across tasks.
