import { type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireStaff();

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const cliente = request.nextUrl.searchParams.get("cliente");

  const supabase = await createClient();
  let query = supabase
    .from("credit_transactions")
    .select(
      "amount_cents, reason, operator_id, created_at, customer:customers!inner(name, member_number)",
    )
    .eq("type", "UTILIZACAO")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (cliente) query = query.ilike("customer.name", `%${cliente}%`);

  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<{
    amount_cents: number;
    reason: string | null;
    operator_id: string | null;
    created_at: string;
    customer: { name: string; member_number: string } | null;
  }>;

  const csv = buildCsv(
    ["Data", "Cliente", "Membro", "Valor debitado", "Operador", "Observação"],
    rows.map((row) => [
      formatDate(row.created_at),
      csvEscape(row.customer?.name ?? ""),
      row.customer?.member_number ?? "",
      formatCents(row.amount_cents),
      row.operator_id ? "Atendimento Neon" : "Automático",
      csvEscape(row.reason ?? ""),
    ]),
  );

  return csvResponse(csv, "utilizacoes.csv");
}
