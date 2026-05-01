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
