import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * JWT HS256 minimalista pro token do QR Code de utilização de crédito.
 * Implementado à mão em vez de usar a lib `jose` — `jose` só publica ESM, e
 * até o import() dinâmico é rebaixado a require() pelo alvo CommonJS do
 * ts-jest (mesmo erro do import estático nos testes de integração). Como o
 * uso aqui é só HS256 sem JWKS/rotação de chave, um HMAC-SHA256 manual com
 * node:crypto (mesmo módulo já usado em lib/cron-auth.ts) resolve sem
 * dependência nova.
 */

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET não configurada — necessária para assinar o QR Code.");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function sign(data: string): string {
  return base64url(createHmac("sha256", getSecret()).update(data).digest());
}

export type QrTokenPayload = {
  requestId: string;
  customerId: string;
  amountCents: number;
};

export function generateQrToken(
  requestId: string,
  customerId: string,
  amountCents: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ requestId, customerId, amountCents, iat: now, exp: now + 5 * 60 }),
  );
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifyQrToken(token: string): QrTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expectedSignature = sign(`${header}.${payload}`);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64urlDecode(payload).toString("utf8"));
    if (
      typeof decoded.requestId !== "string" ||
      typeof decoded.customerId !== "string" ||
      typeof decoded.amountCents !== "number" ||
      typeof decoded.exp !== "number"
    ) {
      return null;
    }
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      requestId: decoded.requestId,
      customerId: decoded.customerId,
      amountCents: decoded.amountCents,
    };
  } catch {
    return null;
  }
}
