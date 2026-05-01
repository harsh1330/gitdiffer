import { spawn } from "node:child_process";

export async function copyToClipboard(text: string): Promise<boolean> {
  const cmds: Array<[string, string[]]> = [
    ["pbcopy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["wl-copy", []],
    ["clip.exe", []],
  ];
  for (const [cmd, args] of cmds) {
    const ok = await tryWrite(cmd, args, text);
    if (ok) return true;
  }
  return false;
}

function tryWrite(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}
