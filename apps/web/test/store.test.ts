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
