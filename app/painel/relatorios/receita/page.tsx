import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatMonthLabel } from "@/lib/reports";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type MrrRow = { month: string; mrr_cents: number };
type RevenueByStatusRow = {
  status: SubscriptionStatus;
  total_count: number;
  total_cents: number;
};

export default async function RelatorioReceitaPage() {
  await requireManager();
  const supabase = await createClient();

  const [{ data: mrrData }, { data: byStatusData }] = await Promise.all([
    supabase.rpc("get_mrr_by_month", { p_months: 6 }),
    supabase.rpc("get_revenue_by_status"),
  ]);

  const mrrRows = (mrrData ?? []) as MrrRow[];
  const byStatusRows = (byStatusData ?? []) as RevenueByStatusRow[];
  const currentMrr = mrrRows.at(-1)?.mrr_cents ?? 0;
  const atRisk = byStatusRows.find((r) => r.status === "INADIMPLENTE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-primary">
            Relatório de receita
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos 6 meses.
          </p>
        </div>
        <a
          href="/api/relatorios/receita/export"
          className={buttonVariants({ variant: "secondary" })}
        >
          Exportar CSV
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-3xl font-bold text-secondary">
              {formatCents(currentMrr)}
            </span>
            <span className="text-xs text-primary-foreground/80">
              MRR (mês atual)
            </span>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-3xl font-bold text-secondary">
              {formatCents(atRisk?.total_cents ?? 0)}
            </span>
            <span className="text-xs text-primary-foreground/80">
              Inadimplência ({atRisk?.total_count ?? 0} assinantes) — valor em
              risco
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MRR por mês</CardTitle>
          <CardDescription>
            Receita recorrente mensal considerando assinaturas ativas ao
            fim de cada mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Mês</th>
                <th className="py-1 font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              {mrrRows.map((row) => (
                <tr key={row.month} className="border-t border-border">
                  <td className="py-1">{formatMonthLabel(row.month)}</td>
                  <td className="py-1">{formatCents(row.mrr_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receita por status de assinatura</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Assinaturas</th>
                <th className="py-1 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {byStatusRows.map((row) => (
                <tr key={row.status} className="border-t border-border">
                  <td className="py-1">
                    {SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status}
                  </td>
                  <td className="py-1">{row.total_count}</td>
                  <td className="py-1">{formatCents(row.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
