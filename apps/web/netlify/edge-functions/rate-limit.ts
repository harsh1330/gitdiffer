const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 10;

export default async (request: Request, context: { ip?: string; next: () => Promise<Response> }) => {
  if (request.method !== "POST") return context.next();
  const ip = context.ip ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.reset < now) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return context.next();
  }
  if (bucket.count >= LIMIT) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many patches. Try again later." }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }
  bucket.count++;
  return context.next();
};

export const config = { path: "/api/patches" };
