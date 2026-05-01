import { randomBytes } from "node:crypto";

export const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const ID_LENGTH = 22;

export function generateId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return out;
}
