import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type DashboardMetrics = {
  assinantes_ativos: number;
  novos_assinantes_mes: number;
  canceladas_mes: number;
  inadimplentes: number;
  receita_recorrente_cents: number;
  credito_liberado_mes_cents: number;
  credito_utilizado_mes_cents: number;
  indicacoes_mes: number;
  membros_ouro: number;
  membros_black: number;
  satisfacao_media: number | null;
};

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {description ? (
        <CardContent className="text-sm text-muted-foreground">
          {description}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default async function PainelPage() {
  await requireStaff();
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_dashboard_metrics");
  const metrics = (data?.[0] ?? null) as DashboardMetrics | null;

  const liberado = metrics?.credito_liberado_mes_cents ?? 0;
  const utilizado = metrics?.credito_utilizado_mes_cents ?? 0;
  const taxaUtilizacao = liberado > 0 ? Math.round((utilizado / liberado) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Painel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral do Clube Neon neste mês.
        </p>
      </div>

      <a
        href="/garcom"
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "secondary", className: "self-start" })}
      >
        📱 Abrir tela do garçom →
      </a>

      {!metrics ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os indicadores.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Assinantes ativos"
            value={String(metrics.assinantes_ativos)}
          />
          <StatCard
            title="Novos assinantes no mês"
            value={String(metrics.novos_assinantes_mes)}
          />
          <StatCard
            title="Canceladas no mês"
            value={String(metrics.canceladas_mes)}
          />
          <StatCard
            title="Inadimplentes"
            value={String(metrics.inadimplentes)}
          />
          <StatCard
            title="Receita recorrente do mês"
            value={formatCents(metrics.receita_recorrente_cents)}
            description="Assinantes ativos × valor do plano"
          />
          <StatCard
            title="Crédito liberado no mês"
            value={formatCents(liberado)}
            description="Soma de CREDITO_MENSAL no ledger"
          />
          <StatCard
            title="Crédito utilizado no mês"
            value={formatCents(utilizado)}
            description="Soma de UTILIZACAO no ledger"
          />
          <StatCard
            title="Taxa de utilização"
            value={`${taxaUtilizacao}%`}
            description="Utilizado ÷ liberado"
          />
          <StatCard
            title="Indicações no mês"
            value={String(metrics.indicacoes_mes)}
          />
          <StatCard title="Membros Ouro" value={String(metrics.membros_ouro)} />
          <StatCard title="Membros Black" value={String(metrics.membros_black)} />
          {metrics.satisfacao_media !== null ? (
            <StatCard
              title="Satisfação média"
              value={`${metrics.satisfacao_media.toFixed(1)} ⭐`}
              description="Últimos 30 dias"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
