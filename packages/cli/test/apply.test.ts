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
