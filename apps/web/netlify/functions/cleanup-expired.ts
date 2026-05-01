import { isExpired } from "@gitdiffer/shared";
import { deletePatch, getPatch, listPatchKeys } from "../../src/lib/store";

export default async function handler(): Promise<Response> {
  const keys = await listPatchKeys();
  let deleted = 0;
  for (const key of keys) {
    const record = await getPatch(key);
    if (record && isExpired(record.expires_at)) {
      await deletePatch(key);
      deleted++;
    }
  }
  return new Response(JSON.stringify({ deleted, scanned: keys.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const config = { schedule: "@daily" };
