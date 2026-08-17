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

type SubscriptionRow = {
  id: string;
  status: SubscriptionStatus;
  started_at: string | null;
  current_period_end: string | null;
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
  const { pending } = await searchParams;
  const supabase = await createClient();

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select(
      "id, status, started_at, current_period_end, plan:plans(name, price_cents, monthly_credit_cents, duration_months, grace_period_months)",
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

  return (
    <div className="flex flex-col gap-6">
      {pending ? (
        <Card className="max-w-md border-secondary bg-secondary/10">
          <CardContent className="pt-6 text-sm text-primary">
            Sua assinatura está sendo processada. Em breve você receberá a
            confirmação.
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Olá, {customer.name}! 👋
        </h1>
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
              Pague R$ 49,90/mês e tenha R$ 99,00 de crédito pra usar na Neon
              quando quiser.
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
              R$ {formatCents(balanceCents).replace("R$", "").trim()}{" "}
              disponíveis este mês
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
              <span className="text-muted-foreground">Valor: </span>
              {formatCents(plan.price_cents)}/mês
            </p>
            <p>
              <span className="text-muted-foreground">Início: </span>
              {formatDate(subscription.started_at)}
            </p>
            <p>
              <span className="text-muted-foreground">Término: </span>
              {formatDate(contractEnd)}
            </p>
            {isActive && !inGracePeriod ? (
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
