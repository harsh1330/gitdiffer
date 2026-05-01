import { execFileSync } from "node:child_process";

export function runGitDiff(args: string[] = []): string {
  return execFileSync("git", ["diff", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
