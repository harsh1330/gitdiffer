export const EXPIRY_OPTIONS = ["1h", "24h", "7d", "30d"] as const;
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

export interface CreatePatchRequest {
  diff: string;
  expires_in: ExpiryOption;
}

export interface CreatePatchResponse {
  id: string;
  url: string;
  expires_at: string;
}

export interface PatchRecord {
  id: string;
  diff: string;
  created_at: string;
  expires_at: string;
  size_bytes: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export const MAX_DIFF_BYTES = 1024 * 1024;
