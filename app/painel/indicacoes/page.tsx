import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = ["PENDENTE", "CREDITADO", "CANCELADO"] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Aguardando ativação",
  CREDITADO: "Crédito liberado",
  CANCELADO: "Cancelada",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDENTE: "outline",
  CREDITADO: "default",
  CANCELADO: "destructive",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PainelIndicacoesPage({
  searchParams,
}: PageProps<"/painel/indicacoes">) {
  await requireStaff();
  const sp = await searchParams;
  const statusFilter = first(sp.status);
  const fromFilter = first(sp.from);
  const toFilter = first(sp.to);

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("system_config")
    .select("referral_credit_cents")
    .limit(1)
    .maybeSingle();
  const referralCreditCents = config?.referral_credit_cents ?? 3000;

  let query = supabase
    .from("referrals")
    .select(
      "id, status, created_at, credited_at, referrer:referrer_customer_id(name, member_number), referred:referred_customer_id(name, member_number)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (fromFilter) query = query.gte("created_at", `${fromFilter}T00:00:00`);
  if (toFilter) query = query.lte("created_at", `${toFilter}T23:59:59`);

  const { data } = await query;
  const referrals = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    created_at: string;
    credited_at: string | null;
    referrer: { name: string; member_number: string } | null;
    referred: { name: string; member_number: string } | null;
  }>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Indicações
      </h1>

      <form className="flex flex-wrap items-end gap-2">
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={fromFilter ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={toFilter ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Indicador</th>
              <th className="px-3 py-2 font-medium">Indicado</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Crédito liberado</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {r.referrer?.name ?? "—"}{" "}
                  <span className="text-muted-foreground">
                    {r.referrer?.member_number}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.referred?.name ?? "—"}{" "}
                  <span className="text-muted-foreground">
                    {r.referred?.member_number}
                  </span>
                </td>
                <td className="px-3 py-2">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_BADGE_VARIANT[r.status]}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {r.status === "CREDITADO"
                    ? `${formatCents(referralCreditCents)} × 2`
                    : "—"}
                </td>
              </tr>
            ))}
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma indicação encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
