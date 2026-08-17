import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import {
  CREDIT_PERIOD_LABELS,
  creditPeriodStart,
  type CreditPeriod,
} from "@/lib/reports";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const PERIODS: CreditPeriod[] = ["atual", "3m", "6m"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RelatorioCreditosPage({
  searchParams,
}: PageProps<"/painel/relatorios/creditos">) {
  await requireManager();
  const sp = await searchParams;
  const periodoParam = first(sp.periodo);
  const periodo: CreditPeriod = PERIODS.includes(periodoParam as CreditPeriod)
    ? (periodoParam as CreditPeriod)
    : "atual";
  const start = creditPeriodStart(periodo);

  const supabase = await createClient();
  const [{ data: summaryData }, { data: topData }] = await Promise.all([
    supabase.rpc("get_credits_summary", { p_start: start.toISOString() }),
    supabase.rpc("get_top_credit_users", { p_start: start.toISOString(), p_limit: 10 }),
  ]);

  const summary = (summaryData?.[0] ?? null) as {
    liberado_cents: number;
    utilizado_cents: number;
    expirado_cents: number;
  } | null;
  const topUsers = (topData ?? []) as Array<{
    customer_id: string;
    customer_name: string;
    member_number: string;
    total_utilizado_cents: number;
  }>;

  const liberado = summary?.liberado_cents ?? 0;
  const utilizado = summary?.utilizado_cents ?? 0;
  const expirado = summary?.expirado_cents ?? 0;
  const taxaUtilizacao = liberado > 0 ? Math.round((utilizado / liberado) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-primary">
            Relatório de créditos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {CREDIT_PERIOD_LABELS[periodo]}
          </p>
        </div>
        <a
          href={`/api/relatorios/creditos/export?periodo=${periodo}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Exportar CSV
        </a>
      </div>

      <form className="flex gap-2">
        {PERIODS.map((p) => (
          <a
            key={p}
            href={`/painel/relatorios/creditos?periodo=${p}`}
            className={buttonVariants({
              variant: p === periodo ? "default" : "outline",
              size: "sm",
            })}
          >
            {CREDIT_PERIOD_LABELS[p]}
          </a>
        ))}
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-2xl font-bold text-secondary">
              {formatCents(liberado)}
            </span>
            <span className="text-xs text-primary-foreground/80">Liberado</span>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-2xl font-bold text-secondary">
              {formatCents(utilizado)}
            </span>
            <span className="text-xs text-primary-foreground/80">Utilizado</span>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-2xl font-bold text-secondary">
              {formatCents(expirado)}
            </span>
            <span className="text-xs text-primary-foreground/80">Expirado</span>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-2xl font-bold text-secondary">
              {taxaUtilizacao}%
            </span>
            <span className="text-xs text-primary-foreground/80">
              Taxa de utilização
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 clientes por utilização</CardTitle>
          <CardDescription>No período selecionado.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Cliente</th>
                <th className="py-1 font-medium">Membro</th>
                <th className="py-1 font-medium">Utilizado</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((row) => (
                <tr key={row.customer_id} className="border-t border-border">
                  <td className="py-1">
                    <a
                      href={`/painel/clientes/${row.customer_id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {row.customer_name}
                    </a>
                  </td>
                  <td className="py-1">{row.member_number}</td>
                  <td className="py-1">{formatCents(row.total_utilizado_cents)}</td>
                </tr>
              ))}
              {topUsers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-muted-foreground">
                    Nenhuma utilização no período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
