import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

type StatusRow = { status: SubscriptionStatus; total: number };
type MonthRow = { month: string; total: number };
type ChurnRow = { month: string; cancelled: number; expired: number };
type RetentionRow = {
  month: string;
  active_start: number;
  active_end: number;
  retention_rate: number | null;
};

export default async function RelatorioAssinantesPage() {
  await requireManager();
  const supabase = await createClient();

  const [{ data: byStatus }, { data: newByMonth }, { data: churn }, { data: retention }] =
    await Promise.all([
      supabase.rpc("get_subscribers_by_status"),
      supabase.rpc("get_new_subscribers_by_month", { p_months: 6 }),
      supabase.rpc("get_churn_by_month", { p_months: 6 }),
      supabase.rpc("get_retention_by_month", { p_months: 6 }),
    ]);

  const statusRows = (byStatus ?? []) as StatusRow[];
  const monthRows = (newByMonth ?? []) as MonthRow[];
  const churnRows = (churn ?? []) as ChurnRow[];
  const retentionRows = (retention ?? []) as RetentionRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-primary">
            Relatório de assinantes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos 6 meses.
          </p>
        </div>
        <a
          href="/api/relatorios/assinantes/export"
          className={buttonVariants({ variant: "secondary" })}
        >
          Exportar CSV
        </a>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardHeader>
          <CardTitle className="text-primary-foreground">
            Total por status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {statusRows.map((row) => (
              <div key={row.status} className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-secondary">
                  {row.total}
                </span>
                <span className="text-xs text-primary-foreground/80">
                  {SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Novos assinantes por mês</CardTitle>
            <CardDescription>Baseado na data de início da assinatura.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Mês</th>
                  <th className="py-1 font-medium">Novos</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((row) => (
                  <tr key={row.month} className="border-t border-border">
                    <td className="py-1">{formatMonthLabel(row.month)}</td>
                    <td className="py-1">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Churn por mês</CardTitle>
            <CardDescription>Cancelamentos + expirações.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Mês</th>
                  <th className="py-1 font-medium">Canceladas</th>
                  <th className="py-1 font-medium">Expiradas</th>
                </tr>
              </thead>
              <tbody>
                {churnRows.map((row) => (
                  <tr key={row.month} className="border-t border-border">
                    <td className="py-1">{formatMonthLabel(row.month)}</td>
                    <td className="py-1">{row.cancelled}</td>
                    <td className="py-1">{row.expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Taxa de retenção</CardTitle>
          <CardDescription>
            Ativas no fim do mês ÷ ativas no início do mês. Aproximação — não
            temos histórico de transição de status, só os timestamps
            disponíveis (início, cancelamento, última atualização).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Mês</th>
                <th className="py-1 font-medium">Ativas no início</th>
                <th className="py-1 font-medium">Ativas no fim</th>
                <th className="py-1 font-medium">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {retentionRows.map((row) => (
                <tr key={row.month} className="border-t border-border">
                  <td className="py-1">{formatMonthLabel(row.month)}</td>
                  <td className="py-1">{row.active_start}</td>
                  <td className="py-1">{row.active_end}</td>
                  <td className="py-1">
                    {row.retention_rate === null ? "—" : `${row.retention_rate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
