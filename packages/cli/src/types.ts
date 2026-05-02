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
