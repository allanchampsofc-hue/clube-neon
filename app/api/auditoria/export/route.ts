import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const params = request.nextUrl.searchParams;
  const action = params.get("action");
  const userId = params.get("user_id");
  const entity = params.get("entity");
  const from = params.get("from");
  const to = params.get("to");

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("user_id, action, entity, entity_id, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);
  if (entity) query = query.eq("entity", entity);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data } = await query;

  const rows = (data ?? []) as Array<{
    user_id: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    ip_address: string | null;
    created_at: string;
  }>;

  const csv = buildCsv(
    ["Data/hora", "Usuário", "Ação", "Entidade", "ID da entidade", "IP"],
    rows.map((row) => [
      formatDateTime(row.created_at),
      row.user_id ?? "Sistema",
      csvEscape(AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action),
      row.entity,
      row.entity_id ?? "",
      row.ip_address ?? "",
    ]),
  );

  return csvResponse(csv, "auditoria.csv");
}
