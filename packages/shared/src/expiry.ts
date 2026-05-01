import type { ExpiryOption } from "./types.js";

export const EXPIRY_DURATIONS_MS: Record<ExpiryOption, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function computeExpiresAt(option: ExpiryOption, now: Date = new Date()): string {
  return new Date(now.getTime() + EXPIRY_DURATIONS_MS[option]).toISOString();
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
