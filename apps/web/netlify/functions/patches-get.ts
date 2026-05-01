import { isExpired } from "@gitdiffer/shared";
import { getPatch } from "../../src/lib/store";

interface Ctx { params: { id: string } }

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await getPatch(ctx.params.id);
  if (!record) return json({ error: "not_found", message: "Unknown patch ID." }, 404);
  if (isExpired(record.expires_at)) {
    return json({ error: "expired", message: "Patch has expired.", expired_at: record.expires_at }, 410);
  }
  return json(record, 200);
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/patches/:id" };
