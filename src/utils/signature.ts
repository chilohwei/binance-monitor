import { createHmac, randomUUID } from "node:crypto";

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function generateRandom(): string {
  return randomUUID().replace(/-/g, "");
}
