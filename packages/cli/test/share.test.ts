import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";

vi.mock("../src/api.js", () => ({
  createPatch: vi.fn(async () => ({
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
