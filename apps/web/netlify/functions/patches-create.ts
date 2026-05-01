import type { CreatePatchResponse, PatchRecord } from "@gitdiffer/shared";
import { computeExpiresAt } from "@gitdiffer/shared";
import { generateId } from "../../src/lib/id";
import { putPatch } from "../../src/lib/store";
import { validateCreateRequest } from "../../src/lib/validate";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Use POST." }, 405);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body", message: "Body must be valid JSON." }, 400);
  }
  const result = validateCreateRequest(body);
  if (!result.ok) return json(result.error, result.status);

  const id = generateId();
  const now = new Date();
  const record: PatchRecord = {
    id,
    diff: result.value.diff,
    created_at: now.toISOString(),
    expires_at: computeExpiresAt(result.value.expires_in, now),
    size_bytes: Buffer.byteLength(result.value.diff, "utf8"),
  };
  await putPatch(record);

  const origin = new URL(req.url).origin;
  const response: CreatePatchResponse = {
    id,
    url: `${origin}/p/${id}`,
    expires_at: record.expires_at,
  };
  return json(response, 201);
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/patches" };
