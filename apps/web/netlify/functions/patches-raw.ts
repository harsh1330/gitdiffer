import { isExpired } from "@gitdiffer/shared";
import { getPatch } from "../../src/lib/store";

interface Ctx { params: { id: string } }

export default async function handler(_req: Request, ctx: Ctx): Promise<Response> {
  const record = await getPatch(ctx.params.id);
  if (!record) {
    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }
  if (isExpired(record.expires_at)) {
    return new Response("expired\n", { status: 410, headers: { "content-type": "text/plain" } });
  }
  return new Response(record.diff, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = { path: "/api/patches/:id/raw" };
