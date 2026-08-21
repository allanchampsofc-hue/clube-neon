import { type NextRequest } from "next/server";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";
import { VOUCHER_TYPE_LABELS, VOUCHER_STATUS_LABELS, PLAN_TYPE_LABELS, type VoucherType, type VoucherStatus, type PlanType } from "@/lib/vouchers";

export async function GET(request: NextRequest) {
  await requireManager();

  const tipo = request.nextUrl.searchParams.get("tipo");
  const status = request.nextUrl.searchParams.get("status");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const supabase = await createClient();
  let query = supabase
    .from("vouchers")
    .select(
      "code, voucher_type, status, created_at, valid_until, used_at, customer:customers(name), subscription:subscriptions(plan:plans(name, plan_type))",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (tipo) query = query.eq("voucher_type", tipo);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<{
    code: string;
    voucher_type: VoucherType;
    status: VoucherStatus;
    created_at: string;
    valid_until: string;
    used_at: string | null;
    customer: { name: string } | null;
    subscription: { plan: { name: string; plan_type: PlanType } | null } | null;
  }>;

  const csv = buildCsv(
    ["Código", "Tipo", "Cliente", "Plano", "Status", "Gerado em", "Válido até", "Utilizado em"],
    rows.map((r) => [
      csvEscape(r.code),
      csvEscape(VOUCHER_TYPE_LABELS[r.voucher_type]),
      csvEscape(r.customer?.name ?? ""),
      csvEscape(r.subscription?.plan ? PLAN_TYPE_LABELS[r.subscription.plan.plan_type] : ""),
      csvEscape(VOUCHER_STATUS_LABELS[r.status]),
      csvEscape(formatDate(r.created_at)),
      csvEscape(formatDate(r.valid_until)),
      csvEscape(r.used_at ? formatDate(r.used_at) : ""),
    ]),
  );

  return csvResponse(csv, "vouchers.csv");
}
