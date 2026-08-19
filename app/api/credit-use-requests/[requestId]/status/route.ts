import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Usada pelo polling do cliente (a cada 3s) enquanto o QR está na tela, e
 * pela tela de confirmação do operador. A própria RLS de credit_use_requests
 * (cliente lê o próprio, staff lê tudo) decide quem pode ver o quê — sem
 * checagem manual de papel aqui.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("credit_use_requests")
    .select(
      "status, confirmed_at, amount_cents, expires_at, credit_transaction:credit_transactions(balance_after_cents)",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  const creditTransaction = data.credit_transaction as unknown as {
    balance_after_cents: number;
  } | null;

  return NextResponse.json({
    status: data.status,
    confirmedAt: data.confirmed_at,
    amountCents: data.amount_cents,
    expiresAt: data.expires_at,
    balanceAfterCents: creditTransaction?.balance_after_cents ?? null,
  });
}
