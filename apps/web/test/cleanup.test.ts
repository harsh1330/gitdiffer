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
