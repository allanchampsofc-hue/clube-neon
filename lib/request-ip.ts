import { headers } from "next/headers";

/** IP do cliente, lido de x-forwarded-for/x-real-ip. null se nenhum presente. */
export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}
