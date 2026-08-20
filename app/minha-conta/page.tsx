import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { addMonths, formatDate } from "@/lib/dates";
import {
  SUBSCRIPTION_STATUS_BADGE_VARIANT,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/subscriptions";
import { CREDIT_TRANSACTION_TYPE_LABELS, type CreditTransactionType } from "@/lib/credit-transactions";
import { PAYMENT_TYPE_LABELS } from "@/lib/subscriptions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { MembershipBadge } from "@/components/membership-badge";
import { MEMBERSHIP_BENEFITS } from "@/lib/membership";

type SubscriptionRow = {
  id: string;
  status: SubscriptionStatus;
  started_at: string | null;
  current_period_end: string | null;
  payment_type: "MONTHLY" | "ANNUAL";
  cancellation_requested_at: string | null;
  cancellation_effective_at: string | null;
  plan: {
    name: string;
    price_cents: number;
    monthly_credit_cents: number;
    duration_months: number;
    grace_period_months: number;
  } | null;
};

type CycleRow = {
  cycle_number: number;
  period_start: string;
  period_end: string;
  is_grace_period: boolean;
};

export default async function MinhaContaPage({
  searchParams,
}: PageProps<"/minha-conta">) {
  const { customer } = await requireCustomer();
  const customerFirstName = customer.name.split(" ")[0];
  const { pending } = await searchParams;
  const supabase = await createClient();

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select(
      "id, status, started_at, current_period_end, payment_type, cancellation_requested_at, cancellation_effective_at, plan:plans(name, price_cents, monthly_credit_cents, duration_months, grace_period_months)",
    )
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = subscriptionData as unknown as SubscriptionRow | null;

  let cycle: CycleRow | null = null;
  if (subscription) {
    const { data } = await supabase
      .from("subscription_cycles")
      .select("cycle_number, period_start, period_end, is_grace_period")
      .eq("subscription_id", subscription.id)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    cycle = data;
  }

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("balance_cents")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: ledgerData } = await supabase
    .from("credit_transactions")
    .select("id, type, amount_cents, reason, operator_id, created_at")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const ledger = ledgerData ?? [];

  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: draw } = await supabase
    .from("monthly_draws")
    .select("prize_description")
    .eq("month", currentMonth)
    .eq("winner_customer_id", customer.id)
    .maybeSingle();

  const { data: pendingCashbackData } = await supabase
    .from("cashback_transactions")
    .select("cashback_cents")
    .eq("customer_id", customer.id)
    .eq("status", "PENDENTE");
  const pendingCashbackCents = (pendingCashbackData ?? []).reduce(
    (sum, c) => sum + c.cashback_cents,
    0,
  );

  const { data: membershipData } = await supabase
    .from("customers")
    .select("membership_level")
    .eq("id", customer.id)
    .single();
  const membershipLevel = membershipData?.membership_level ?? "MEMBRO";

  let membershipMonths = 0;
  if (subscription && subscription.status === "ATIVA") {
    const { count } = await supabase
      .from("subscription_cycles")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", subscription.id);
    membershipMonths = count ?? 0;
  }

  const membershipNextTarget =
    membershipLevel === "MEMBRO" ? 6 : membershipLevel === "OURO" ? 12 : null;
  const membershipSegmentStart = membershipLevel === "OURO" ? 6 : 0;
  const membershipPct =
    membershipNextTarget !== null
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((membershipMonths - membershipSegmentStart) /
                (membershipNextTarget - membershipSegmentStart)) *
                100,
            ),
          ),
        )
      : 100;

  const plan = subscription?.plan ?? null;
  const inGracePeriod = cycle?.is_grace_period ?? false;
  const isActive = subscription?.status === "ATIVA";
  const showSubscribeCta =
    !subscription || ["CANCELADA", "EXPIRADA"].includes(subscription.status);

  const totalCents = plan?.monthly_credit_cents ?? 0;
  const balanceCents = wallet?.balance_cents ?? 0;
  const usedCents = Math.max(0, totalCents - balanceCents);
  const pct = totalCents > 0 ? Math.min(100, Math.round((usedCents / totalCents) * 100)) : 0;

  const contractEnd =
    subscription?.started_at && plan
      ? addMonths(subscription.started_at, plan.duration_months)
      : null;

  const cycleLabel = inGracePeriod
    ? "Carência"
    : cycle && plan
      ? `Mês ${cycle.cycle_number} de ${plan.duration_months}`
      : "—";

  const daysUntilExpiry = cycle
    ? Math.ceil((new Date(cycle.period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  // "Alto" aqui é uma escolha simples: pelo menos 30% do crédito do mês
  // ainda disponível — evita alertar quem já gastou quase tudo.
  const showExpiryUrgency =
    daysUntilExpiry !== null &&
    daysUntilExpiry <= 5 &&
    daysUntilExpiry >= 0 &&
    balanceCents >= totalCents * 0.3 &&
    balanceCents > 0;

  return (
    <div className="flex flex-col gap-6">
      {pending ? (
        <Card className="max-w-md border-secondary bg-secondary/10">
          <CardContent className="pt-6 text-sm text-primary">
            Recebemos seu pedido, {customerFirstName}. Vamos confirmar e
            liberar seu crédito em breve.
          </CardContent>
        </Card>
      ) : null}

      {draw ? (
        <Card className="max-w-md border-secondary bg-secondary/10">
          <CardContent className="pt-6 text-sm text-primary">
            🎉 Parabéns! Você foi sorteado este mês! Seu prêmio:{" "}
            {draw.prize_description}. Entre em contato com a Neon.
          </CardContent>
        </Card>
      ) : null}

      {pendingCashbackCents > 0 ? (
        <Card className="max-w-md border-secondary bg-secondary/10">
          <CardContent className="pt-6 text-sm text-primary">
            💰 Você tem {formatCents(pendingCashbackCents)} de cashback
            aguardando o próximo ciclo.
          </CardContent>
        </Card>
      ) : null}

      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold text-primary">
            Olá, {customerFirstName}! 👋
          </h1>
          <MembershipBadge level={membershipLevel} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Você faz parte do Clube Neon.
        </p>
        {isActive && !inGracePeriod ? (
          <p className="mt-1 text-sm font-medium text-primary">
            Tudo certo! Seu Clube Neon está ativo. 🍕
          </p>
        ) : null}
      </div>

      {showSubscribeCta ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Você ainda não é assinante do Clube Neon</CardTitle>
            <CardDescription>
              Plano anual — 12x R$ 49,90 ou R$ 499,00 à vista — R$ 99,00 de
              crédito todo mês, válido no mês de referência.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/" className={buttonVariants()}>
              Quero ser membro
            </a>
          </CardContent>
        </Card>
      ) : null}

      {wallet && !inGracePeriod && subscription ? (
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Suas pizzas do mês 🍕</CardTitle>
              <Badge variant={SUBSCRIPTION_STATUS_BADGE_VARIANT[subscription.status]}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </Badge>
            </div>
            <CardDescription>
              {formatCents(balanceCents)} disponíveis este mês
              {cycle ? ` — válidos até ${formatDate(cycle.period_end)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-3xl font-bold text-primary">
              {formatCents(balanceCents)}
            </p>
            {totalCents > 0 ? (
              <>
                <Progress value={pct} />
                <p className="text-sm text-muted-foreground">
                  {formatCents(usedCents)} utilizados de {formatCents(totalCents)}
                </p>
              </>
            ) : null}
            <p className="text-xs text-muted-foreground">
              ⚠️ Crédito válido só neste mês — não é transferido pro
              próximo.
            </p>
            {showExpiryUrgency ? (
              <p className="rounded-md bg-destructive/10 p-2 text-sm font-medium text-destructive">
                Ei, {customerFirstName} — ainda tem {formatCents(balanceCents)}{" "}
                sobrando e o mês acaba em {daysUntilExpiry}{" "}
                {daysUntilExpiry === 1 ? "dia" : "dias"}. Que tal uma
                visita?
              </p>
            ) : null}
            {balanceCents > 0 ? (
              <a
                href="/minha-conta/usar-credito"
                className={buttonVariants({ variant: "secondary", className: "mt-1 self-start" })}
              >
                🍕 Usar crédito agora
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {subscription && plan ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Assinatura</CardTitle>
            <CardDescription>{plan.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">Pagamento: </span>
              Plano anual — {PAYMENT_TYPE_LABELS[subscription.payment_type]}
            </p>
            <p>
              <span className="text-muted-foreground">Início: </span>
              {formatDate(subscription.started_at)}
            </p>
            <p>
              <span className="text-muted-foreground">Término: </span>
              {formatDate(contractEnd)}
            </p>
            {isActive && !inGracePeriod && subscription.payment_type === "MONTHLY" ? (
              <p>
                <span className="text-muted-foreground">Próxima cobrança: </span>
                {formatDate(subscription.current_period_end)}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Ciclo atual: </span>
              {cycleLabel}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {subscription?.cancellation_requested_at ? (
        <Card className="max-w-md border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium text-destructive">
              Cancelamento registrado
            </p>
            <p className="mt-1 text-muted-foreground">
              {subscription.payment_type === "ANNUAL"
                ? `Como você pagou à vista, seu crédito mensal segue normalmente até ${formatDate(contractEnd)}. Nenhum valor será devolvido.`
                : `Sua participação encerra em ${formatDate(subscription.cancellation_effective_at)}. Até lá, você continua recebendo e podendo usar o crédito mensal.`}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {subscription && subscription.status === "ATIVA" ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Seu nível no Clube Neon</CardTitle>
            <CardDescription>
              Você é membro há {membershipMonths}{" "}
              {membershipMonths === 1 ? "mês" : "meses"} consecutivo
              {membershipMonths === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Progress value={membershipPct} />
            <p className="text-sm text-muted-foreground">
              {membershipLevel === "BLACK"
                ? "Você atingiu o nível máximo! 🎉"
                : `Faltam ${(membershipNextTarget ?? 0) - membershipMonths} mês(es) para ${
                    membershipLevel === "MEMBRO" ? "OURO" : "BLACK"
                  }`}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Seu benefício: </span>
              {MEMBERSHIP_BENEFITS[membershipLevel]}
            </p>
            <p className="text-xs text-muted-foreground">
              Descontos são aplicados pelo atendente na hora do pedido.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {inGracePeriod && cycle ? (
        <Card className="max-w-md border-secondary">
          <CardHeader>
            <CardTitle>Você está no período de carência</CardTitle>
            <CardDescription>
              Sua assinatura concluiu os meses contratados — o saldo que
              sobrou do último mês ainda pode ser usado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <p className="text-2xl font-bold text-primary">
              {formatCents(balanceCents)}
            </p>
            <p className="text-muted-foreground">crédito restante disponível</p>
            <p>
              <span className="text-muted-foreground">Expira em: </span>
              {formatDate(cycle.period_end)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>Suas últimas movimentações de crédito.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma movimentação ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {ledger.map((tx) => (
                <li
                  key={tx.id}
                  className="flex flex-col border-t border-border pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {CREDIT_TRANSACTION_TYPE_LABELS[
                        tx.type as CreditTransactionType
                      ] ?? tx.type}
                    </span>
                    <span
                      className={
                        tx.amount_cents < 0 ? "text-destructive" : "text-primary"
                      }
                    >
                      {tx.amount_cents > 0 ? "+" : ""}
                      {formatCents(tx.amount_cents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>
                      {formatDate(tx.created_at)}
                      {tx.reason ? ` · ${tx.reason}` : ""}
                    </span>
                    <span>{tx.operator_id ? "Atendimento Neon" : "Automático"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <a
            href="/minha-conta/historico"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
          >
            Ver histórico completo
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
