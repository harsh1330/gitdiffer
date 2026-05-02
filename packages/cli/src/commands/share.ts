import { readFileSync } from "node:fs";
import type { ExpiryOption } from "../types.js";
import { EXPIRY_OPTIONS } from "../types.js";
import { runGitDiff } from "../util/git.js";
import { createPatch } from "../api.js";

interface ShareOptions {
  source: { kind: "git"; gitArgs: string[] } | { kind: "stdin" } | { kind: "file"; path: string };
  expiresIn: ExpiryOption;
}

export async function share(opts: ShareOptions, stdin: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const diff = await readSource(opts.source, stdin);
  if (!diff.trim()) throw new Error("gitdiffer: no diff to share (input is empty).");
  const result = await createPatch({ diff, expires_in: opts.expiresIn });
  return result.url;
}

async function readSource(source: ShareOptions["source"], stdin: NodeJS.ReadableStream): Promise<string> {
  if (source.kind === "git") return runGitDiff(source.gitArgs);
  if (source.kind === "file") return readFileSync(source.path, "utf8");
  return readStream(stdin);
}

function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (buf += chunk));
    stream.on("end", () => resolve(buf));
    stream.on("error", reject);
  });
}

export function parseShareArgs(argv: string[]): ShareOptions {
  let expiresIn: ExpiryOption = "7d";
  let file: string | null = null;
  let stdinFlag = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--expires" || arg === "-e") {
      const next = argv[++i];
      if (!next || !EXPIRY_OPTIONS.includes(next as never)) {
        throw new Error(`--expires must be one of ${EXPIRY_OPTIONS.join(", ")}`);
      }
      expiresIn = next as ExpiryOption;
    } else if (arg === "--file" || arg === "-f") {
      file = argv[++i] ?? null;
      if (!file) throw new Error("--file requires a path");
    } else if (arg === "-") {
      stdinFlag = true;
    } else {
      positional.push(arg);
    }
  }

  const source: ShareOptions["source"] =
    file !== null
      ? { kind: "file", path: file }
      : stdinFlag
        ? { kind: "stdin" }
        : { kind: "git", gitArgs: positional };

  return { source, expiresIn };
}
