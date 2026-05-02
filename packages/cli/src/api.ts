import type { CreatePatchRequest, CreatePatchResponse } from "@gitdiffer/shared";

const DEFAULT_HOST = "https://polite-tanuki-d0250a.netlify.app";

function host(): string {
  return process.env.GITDIFFER_HOST ?? DEFAULT_HOST;
}

export async function createPatch(req: CreatePatchRequest): Promise<CreatePatchResponse> {
  const res = await fetch(`${host()}/api/patches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string };
    throw new Error(`gitdiffer: ${body.message ?? res.statusText}`);
  }
  return (await res.json()) as CreatePatchResponse;
}

export async function fetchPatchRaw(idOrUrl: string): Promise<string> {
  const id = extractId(idOrUrl);
  const res = await fetch(`${host()}/api/patches/${id}/raw`);
  if (res.status === 404) throw new Error("gitdiffer: patch not found.");
  if (res.status === 410) throw new Error("gitdiffer: patch has expired.");
  if (!res.ok) throw new Error(`gitdiffer: HTTP ${res.status}`);
  return res.text();
}

export function extractId(input: string): string {
  const m = input.match(/[A-Za-z0-9]{22}/);
  if (!m) throw new Error("gitdiffer: could not parse patch id from input.");
  return m[0];
}
