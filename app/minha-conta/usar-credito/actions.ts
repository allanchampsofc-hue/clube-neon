"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/auth";
import { generateQrToken } from "@/lib/qr-token";
import { getSiteOrigin } from "@/lib/site-url";

export type CreateCreditUseRequestResult =
  | { ok: true; requestId: string; qrUrl: string; expiresAt: string; amountCents: number }
  | { ok: false; error: string };

/**
 * Gera um novo pedido de utilização + QR Code. O id do pedido é gerado aqui
 * (não pelo banco) porque o JWT precisa desse id no payload, e o token
 * assinado por sua vez precisa ser gravado na mesma linha que o cria —
 * evita uma segunda escrita/RPC só pra preencher o token depois.
 */
export async function createCreditUseRequest(
  amountCents: number,
): Promise<CreateCreditUseRequestResult> {
  const { customer } = await requireCustomer();

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Valor inválido." };
  }

  const requestId = randomUUID();
  const token = generateQrToken(requestId, customer.id, amountCents);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_credit_use_request", {
      p_id: requestId,
      p_customer_id: customer.id,
      p_amount_cents: amountCents,
      p_token: token,
    })
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Não foi possível gerar o QR Code." };
  }

  const request = data as { id: string; expires_at: string };
  const origin = await getSiteOrigin();
  const qrUrl = `${origin}/painel/utilizacao/confirmar/${request.id}?t=${encodeURIComponent(token)}`;

  return { ok: true, requestId: request.id, qrUrl, expiresAt: request.expires_at, amountCents };
}

export async function cancelCreditUseRequest(requestId: string): Promise<{ ok: boolean }> {
  await requireCustomer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_credit_use_request", {
    p_request_id: requestId,
  });
  return { ok: !error };
}
