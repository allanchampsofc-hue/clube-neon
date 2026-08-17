import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function MeuCreditoPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select("id, status, plan:plans(monthly_credit_cents)")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = subscriptionData as unknown as {
    id: string;
    status: string;
    plan: { monthly_credit_cents: number } | null;
  } | null;

  let cycle: { cycle_number: number; period_start: string; period_end: string; is_grace_period: boolean } | null =
    null;
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

  if (!wallet) {
    return (
      <p className="text-sm text-muted-foreground">
        Você ainda não tem crédito liberado — assine o Clube Neon pra
        começar a usar.
      </p>
    );
  }

  const totalCents = cycle?.is_grace_period ? 0 : subscription?.plan?.monthly_credit_cents ?? 0;
  const balanceCents = wallet.balance_cents;
  const usedCents = Math.max(0, totalCents - balanceCents);
  const pct = totalCents > 0 ? Math.min(100, Math.round((usedCents / totalCents) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Meu Crédito
      </h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            {cycle?.is_grace_period ? "Saldo do período de carência" : "Suas pizzas do mês 🍕"}
          </CardTitle>
          <CardDescription>
            {cycle
              ? `Ciclo de ${formatDate(cycle.period_start)} até ${formatDate(cycle.period_end)}`
              : "Sem ciclo aberto no momento."}
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Crédito remanescente — nenhum crédito novo será liberado até o
              fim da carência.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
