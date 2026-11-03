import { spawn } from "node:child_process";
import { fetchPatchRaw } from "../api.js";

export type ApplyResult = "applied" | "applied-3way" | "already-applied";

export async function runApplyOrView(cmd: "apply" | "view", argv: string[]): Promise<void> {
  const target = argv[0];
  if (!target) throw new Error(`gitdiffer: usage: gitdiffer ${cmd} <id-or-url>`);
  const diff = await fetchPatchRaw(target);

  if (cmd === "view") {
    process.stdout.write(diff);
    return;
  }

  const result = await applyDiff(diff);
  if (result === "already-applied") console.log("gitdiffer: this patch is already applied. Nothing to do.");
  if (result === "applied-3way") console.log("gitdiffer: applied with a 3-way merge (your files differed from the sender's).");
}

// git apply gives the same "patch does not apply" error for several different causes,
// so when it fails we work out which one it was and say so.
export async function applyDiff(diff: string, cwd = process.cwd()): Promise<ApplyResult> {
  const first = await git(["apply"], cwd, diff);
  if (first.code === 0) return "applied";

  if ((await git(["apply", "--reverse", "--check"], cwd, diff)).code === 0) return "already-applied";

  const paths = patchPaths(diff);
  const dirty = paths.length ? (await git(["status", "--porcelain", "--", ...paths], cwd)).out.trimEnd() : "";
  if (dirty) {
    const files = dirty.split("\n").map((l) => l.slice(3)).join(", ");
    throw new Error(
      `gitdiffer: you have local changes in ${files} that conflict with this patch.\n` +
        `  Commit or stash them (git stash), then run apply again.`,
    );
  }

  const threeWay = await git(["apply", "--3way"], cwd, diff);
  if (threeWay.code === 0) {
    // --3way stages its result; unstage so it behaves like a plain apply.
    await git(["reset", "-q", "--", ...paths], cwd);
    return "applied-3way";
  }

  const conflicted = (await git(["diff", "--name-only", "--diff-filter=U"], cwd)).out.trim();
  if (conflicted) {
    throw new Error(
      `gitdiffer: applied with conflicts in ${conflicted.split("\n").join(", ")}.\n` +
        `  Resolve the <<<<<<< / >>>>>>> markers like a merge conflict.`,
    );
  }

  throw new Error(
    `${first.err.trim()}\n` +
      `gitdiffer: the patch doesn't match your files. You're probably on a different commit than the sender.`,
  );
}

function patchPaths(diff: string): string[] {
  const paths = new Set<string>();
  for (const line of diff.split("\n")) {
    const m = /^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line);
    if (m?.[1]) paths.add(m[1]);
  }
  return [...paths];
}

function git(args: string[], cwd: string, input?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d: Buffer) => (out += d));
    proc.stderr?.on("data", (d: Buffer) => (err += d));
    proc.on("error", (e: Error) => reject(new Error(`gitdiffer: failed to spawn git: ${e.message}`)));
    proc.on("close", (code: number | null) => resolve({ code: code ?? 1, out, err }));
    if (input !== undefined) proc.stdin.write(input);
    proc.stdin.end();
  });
}
