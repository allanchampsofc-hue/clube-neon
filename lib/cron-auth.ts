import { timingSafeEqual } from "node:crypto";

/** Comparação constant-time do Bearer token contra CRON_SECRET — usada por toda rota de cron. */
export function isAuthorizedCronRequest(authHeader: string | null): boolean {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  const received = Buffer.from(authHeader ?? "");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
