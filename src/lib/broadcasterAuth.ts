import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isBroadcasterKeyValid(key: string): boolean {
  const serverKey = process.env.BROADCASTER_KEY;
  return Boolean(serverKey && key && safeEqual(key, serverKey));
}
