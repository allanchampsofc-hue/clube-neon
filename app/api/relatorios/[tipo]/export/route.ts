import { NextResponse, type NextRequest } from "next/server";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate, addMonths } from "@/lib/dates";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";
import {
  creditPeriodStart,
  formatMonthLabel,
  type CreditPeriod,
} from "@/lib/reports";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
import { CREDIT_TRANSACTION_TYPE_LABELS, type CreditTransactionType } from "@/lib/credit-transactions";

async function exportAssinantes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "status, started_at, current_period_end, customer:customers(name, email, member_number), plan:plans(name, duration_months)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as unknown as Array<{
    status: SubscriptionStatus;
    started_at: string | null;
    current_period_end: string | null;
    customer: { name: string; email: string | null; member_number: string } | null;
    plan: { name: string; duration_months: number } | null;
  }>;

  return buildCsv(
    ["Cliente", "E-mail", "Membro", "Plano", "Status", "Início", "Término previsto", "Próxima cobrança"],
    rows.map((row) => {
      const contractEnd =
        row.started_at && row.plan ? addMonths(row.started_at, row.plan.duration_months) : null;
      return [
        csvEscape(row.customer?.name ?? ""),
        row.customer?.email ?? "",
        row.customer?.member_number ?? "",
        csvEscape(row.plan?.name ?? ""),
        SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status,
        formatDate(row.started_at),
        formatDate(contractEnd),
        formatDate(row.current_period_end),
      ];
    }),
  );
}

async function exportCreditos(request: NextRequest) {
  const periodoParam = request.nextUrl.searchParams.get("periodo");
  const periodo: CreditPeriod = ["atual", "3m", "6m"].includes(periodoParam ?? "")
    ? (periodoParam as CreditPeriod)
    : "atual";
  const start = creditPeriodStart(periodo);

  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_transactions")
    .select("type, amount_cents, reason, operator_id, created_at, customer:customers(name, member_number)")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as unknown as Array<{
    type: CreditTransactionType;
    amount_cents: number;
    reason: string | null;
    operator_id: string | null;
    created_at: string;
    customer: { name: string; member_number: string } | null;
  }>;

  return buildCsv(
    ["Data", "Cliente", "Membro", "Tipo", "Valor", "Operador", "Observação"],
    rows.map((row) => [
      formatDate(row.created_at),
      csvEscape(row.customer?.name ?? ""),
      row.customer?.member_number ?? "",
      CREDIT_TRANSACTION_TYPE_LABELS[row.type] ?? row.type,
      formatCents(row.amount_cents),
      row.operator_id ? "Atendimento Neon" : "Automático",
      csvEscape(row.reason ?? ""),
    ]),
  );
}

async function exportReceita() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_mrr_by_month", { p_months: 6 });
  const rows = (data ?? []) as Array<{ month: string; mrr_cents: number }>;

  return buildCsv(
    ["Mês", "MRR"],
    rows.map((row) => [formatMonthLabel(row.month), formatCents(row.mrr_cents)]),
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string }> },
) {
  await requireManager();
  const { tipo } = await params;

  let csv: string;
  let filename: string;

  switch (tipo) {
    case "assinantes":
      csv = await exportAssinantes();
      filename = "relatorio-assinantes.csv";
      break;
    case "creditos":
      csv = await exportCreditos(request);
      filename = "relatorio-creditos.csv";
      break;
    case "receita":
      csv = await exportReceita();
      filename = "relatorio-receita.csv";
      break;
    default:
      return NextResponse.json({ error: "Relatório desconhecido." }, { status: 404 });
  }

  return csvResponse(csv, filename);
}
