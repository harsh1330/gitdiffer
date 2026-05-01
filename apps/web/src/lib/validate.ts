import {
  EXPIRY_OPTIONS,
  MAX_DIFF_BYTES,
  type CreatePatchRequest,
  type ApiError,
} from "@gitdiffer/shared";

type Result =
  | { ok: true; value: CreatePatchRequest }
  | { ok: false; error: ApiError; status: number };

export function validateCreateRequest(input: unknown): Result {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      status: 400,
      error: { error: "invalid_body", message: "Request body must be a JSON object." },
    };
  }
  const { diff, expires_in } = input as Record<string, unknown>;
  if (typeof diff !== "string") {
    return {
      ok: false,
      status: 400,
      error: { error: "invalid_diff", message: "Field 'diff' must be a string." },
    };
  }
  if (diff.length === 0) {
    return {
      ok: false,
      status: 400,
      error: { error: "empty_diff", message: "Diff is empty." },
    };
  }
  if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES) {
    return {
      ok: false,
      status: 413,
      error: { error: "diff_too_large", message: "Diff exceeds 1 MB limit." },
    };
  }
  if (typeof expires_in !== "string" || !EXPIRY_OPTIONS.includes(expires_in as never)) {
    return {
      ok: false,
      status: 400,
      error: {
        error: "invalid_expiry",
        message: `Field 'expires_in' must be one of ${EXPIRY_OPTIONS.join(", ")}.`,
      },
    };
  }
  return { ok: true, value: { diff, expires_in: expires_in as CreatePatchRequest["expires_in"] } };
}
