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
