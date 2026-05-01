import { parseShareArgs, share } from "./commands/share.js";
import { copyToClipboard } from "./util/clipboard.js";

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "share") {
      const opts = parseShareArgs(rest);
      const url = await share(opts);
      const copied = await copyToClipboard(url);
      console.log(`✓ Patch shared (expires in ${opts.expiresIn})`);
      console.log(`  ${url}${copied ? "  (copied to clipboard)" : ""}`);
      return;
    }
    if (cmd === "apply" || cmd === "view") {
      const { runApplyOrView } = await import("./commands/apply.js");
      await runApplyOrView(cmd, rest);
      return;
    }
    printUsage();
    process.exit(cmd ? 1 : 0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`gitdiffer — share a git diff via URL

Usage:
  gitdiffer share [git-args...] [--expires 1h|24h|7d|30d]
  gitdiffer share -                       (read diff from stdin)
  gitdiffer share --file change.patch
  gitdiffer apply <id-or-url>
  gitdiffer view  <id-or-url>

Env:
  GITDIFFER_HOST   override the API host (default: https://gitdiffer.app)
`);
}
