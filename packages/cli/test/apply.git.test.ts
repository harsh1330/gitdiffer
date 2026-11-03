import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDiff } from "../src/commands/apply.js";

// These run real git in a throwaway repo, so they exercise git's actual behaviour.

const BASE = "a\nb\nnt := x\nc\nd\n";
const PATCHED = "a\nb\nntmp := x\nc\nd\n";

let dir: string;
let diff: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}
const write = (s: string) => writeFileSync(join(dir, "f.go"), s);
const read = () => readFileSync(join(dir, "f.go"), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gitdiffer-"));
  git("init", "-q");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  write(BASE);
  git("add", ".");
  git("commit", "-qm", "base");
  write(PATCHED);
  diff = git("diff");
  git("checkout", "-q", "f.go");
});

describe("applyDiff", () => {
  it("applies a clean patch", async () => {
    expect(await applyDiff(diff, dir)).toBe("applied");
    expect(read()).toBe(PATCHED);
  });

  it("applies when unrelated lines in the same file are edited", async () => {
    write(BASE + "zzz\n");
    expect(await applyDiff(diff, dir)).toBe("applied");
    expect(read()).toBe(PATCHED + "zzz\n");
  });

  it("reports an already-applied patch without failing", async () => {
    write(PATCHED);
    expect(await applyDiff(diff, dir)).toBe("already-applied");
    expect(read()).toBe(PATCHED);
  });

  it("refuses when uncommitted changes conflict, and leaves them untouched", async () => {
    write("a\nb\nfoo := y\nc\nd\n");
    await expect(applyDiff(diff, dir)).rejects.toThrow(/local changes in f\.go.*git stash/s);
    expect(read()).toBe("a\nb\nfoo := y\nc\nd\n");
  });

  it("falls back to a 3-way merge and reports conflicts when committed history differs", async () => {
    write("a\nb\nfoo := y\nc\nd\n");
    git("commit", "-qam", "other");
    await expect(applyDiff(diff, dir)).rejects.toThrow(/conflicts in f\.go/);
    expect(read()).toMatch(/<<<<<<<[\s\S]*foo := y[\s\S]*ntmp := x[\s\S]*>>>>>>>/);
  });

  it("3-way merges cleanly when the base differs elsewhere, leaving the change unstaged", async () => {
    // "a" is context for the patch, so plain apply fails, but it's not adjacent to the change.
    write(BASE.replace("a\n", "A\n"));
    git("commit", "-qam", "edit top");
    expect(await applyDiff(diff, dir)).toBe("applied-3way");
    expect(read()).toBe(PATCHED.replace("a\n", "A\n"));
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  it("explains a mismatch when the sender's file isn't in this repo", async () => {
    const foreign = diff.replace(/index \S+/, "index 1234567..89abcde");
    write("totally\ndifferent\n");
    git("commit", "-qam", "rewrite");
    await expect(applyDiff(foreign, dir)).rejects.toThrow(/different commit than the sender/);
  });
});
