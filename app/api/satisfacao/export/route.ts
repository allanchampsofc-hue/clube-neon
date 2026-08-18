import { type NextRequest } from "next/server";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando envio",
  SENT: "Enviada",
  ANSWERED: "Respondida",
  FAILED: "Falha no envio",
};

export async function GET(request: NextRequest) {
  await requireManager();

  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const minScore = params.get("min_score");
  const status = params.get("status");

  const supabase = await createClient();
  let query = supabase
    .from("satisfaction_surveys")
    .select(
      "score, status, sent_at, answered_at, created_at, customer:customer_id(name, member_number)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (minScore) query = query.gte("score", Number(minScore));
  if (status) query = query.eq("status", status);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Array<{
    score: number | null;
    status: string;
    sent_at: string | null;
    answered_at: string | null;
    created_at: string;
    customer: { name: string; member_number: string } | null;
  }>;

  const csv = buildCsv(
    ["Data", "Cliente", "Membro", "Nota", "Status", "Enviada em", "Respondida em"],
    rows.map((row) => [
      formatDateTime(row.created_at),
      csvEscape(row.customer?.name ?? ""),
      row.customer?.member_number ?? "",
      row.score != null ? String(row.score) : "",
      STATUS_LABELS[row.status] ?? row.status,
      row.sent_at ? formatDateTime(row.sent_at) : "",
      row.answered_at ? formatDateTime(row.answered_at) : "",
    ]),
  );

  return csvResponse(csv, "satisfacao.csv");
}
