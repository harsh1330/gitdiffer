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
