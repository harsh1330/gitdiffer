import { getStore } from "@netlify/blobs";
import type { PatchRecord } from "@gitdiffer/shared";

const STORE_NAME = "patches";

function patches() {
  return getStore(STORE_NAME);
}

export async function putPatch(record: PatchRecord): Promise<void> {
  await patches().set(record.id, JSON.stringify(record));
}

export async function getPatch(id: string): Promise<PatchRecord | null> {
  const raw = await patches().get(id);
  if (!raw) return null;
  const text = typeof raw === "string" ? raw : await (raw as { text: () => Promise<string> }).text();
  return JSON.parse(text) as PatchRecord;
}

export async function deletePatch(id: string): Promise<void> {
  await patches().delete(id);
}

export async function listPatchKeys(): Promise<string[]> {
  const result = await patches().list();
  return result.blobs.map((b: { key: string }) => b.key);
}
