import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
import { formatCents, reaisToCents } from "@/lib/money";
import { validateDebit } from "@/lib/credit-rules";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { confirmCreditUsage } from "../../actions";
import { CashbackUsageFields } from "@/components/cashback-usage-fields";
import { calculateCashback } from "@/lib/cashback-rules";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UtilizacaoClientePage({
  params,
  searchParams,
}: PageProps<"/painel/utilizacao/nova/[customerId]">) {
  await requireStaff();
  const { customerId } = await params;
  const sp = await searchParams;
  const amountParam = first(sp.amount);
  const noteParam = first(sp.note) ?? "";
  const orderTotalParam = first(sp.order_total) ?? "";
  const errorParam = first(sp.error);
  const successParam = first(sp.success);
  const cashbackParam = first(sp.cashback);

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, cpf, member_number, active")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    return <p className="text-sm text-destructive">Cliente não encontrado.</p>;
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan:plans(name)")
    .eq("customer_id", customerId)
    .eq("status", "ATIVA")
    .maybeSingle();

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("id, balance_cents")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planName = (subscription as { plan: { name: string } | null } | null)
    ?.plan?.name;

  const { data: config } = await supabase
    .from("system_config")
    .select("cashback_enabled, cashback_percentage, cashback_max_cents")
    .limit(1)
    .maybeSingle();
  const cashbackEnabled = config?.cashback_enabled ?? true;
  const cashbackPercentage = config?.cashback_percentage ?? 5;
  const cashbackMaxCents = config?.cashback_max_cents ?? 1500;

  const { data: pendingReferral } = await supabase
    .from("referrals")
    .select("id")
    .or(`referrer_customer_id.eq.${customerId},referred_customer_id.eq.${customerId}`)
    .eq("status", "PENDENTE")
    .maybeSingle();
  const hasPendingReferral = Boolean(pendingReferral);

  const backLink = (
    <a
      href="/painel/utilizacao/nova"
      className="text-sm text-primary underline-offset-4 hover:underline"
    >
      ← Buscar outro cliente
    </a>
  );

  // Passo 9: confirmação de sucesso.
  if (successParam && amountParam) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>✅ Pronto!</CardTitle>
            <CardDescription>
              {formatCents(reaisToCents(Number(amountParam)))} utilizados com
              sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">
              Saldo disponível:{" "}
              <span className="font-medium text-primary">
                {formatCents(wallet?.balance_cents ?? 0)}
              </span>
            </p>
            {cashbackParam && Number(cashbackParam) > 0 ? (
              <p className="text-sm text-secondary-foreground">
                💰 {formatCents(Number(cashbackParam))} de cashback gerado — cai no
                próximo ciclo.
              </p>
            ) : null}
            <a
              href="/painel/utilizacao/nova"
              className={buttonVariants({ className: "self-start" })}
            >
              Atender outro cliente
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subscription || !wallet) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p className="text-sm text-destructive">
          {customer.name} não tem assinatura ativa nem carteira de crédito —
          não é possível utilizar crédito agora.
        </p>
      </div>
    );
  }

  // Passo 6: tela de confirmação antes de debitar.
  if (amountParam) {
    const amountReais = Number(amountParam);
    const amountCents = reaisToCents(amountReais);
    const validation = validateDebit(wallet.balance_cents, amountCents);
    const invalid = !validation.valid;

    const orderTotalReais = Number(orderTotalParam);
    const extraSpentCents =
      orderTotalParam && Number.isFinite(orderTotalReais)
        ? reaisToCents(orderTotalReais) - amountCents
        : 0;
    const cashbackPreviewCents =
      cashbackEnabled && !hasPendingReferral
        ? calculateCashback(extraSpentCents, cashbackPercentage, cashbackMaxCents)
        : 0;

    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{customer.name}</CardTitle>
            <CardDescription>
              {formatCpf(customer.cpf)} · {customer.member_number}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!validation.valid ? (
              <p className="text-sm text-destructive">
                {validation.reason}
                {validation.reason === "Saldo insuficiente."
                  ? ` Saldo atual: ${formatCents(wallet.balance_cents)}.`
                  : ""}
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Você está utilizando{" "}
                  <span className="font-medium">
                    {formatCents(amountCents)}
                  </span>{" "}
                  do crédito do cliente.
                </p>
                <p className="text-sm text-muted-foreground">
                  Saldo atual: {formatCents(wallet.balance_cents)}
                  <br />
                  Saldo após: {formatCents(wallet.balance_cents - amountCents)}
                </p>
                {cashbackPreviewCents > 0 ? (
                  <p className="text-sm text-secondary-foreground">
                    💰 Cliente vai ganhar {formatCents(cashbackPreviewCents)} de
                    cashback no próximo ciclo
                  </p>
                ) : hasPendingReferral && extraSpentCents > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ℹ️ Cashback não disponível: cliente tem benefício de indicação
                    ativo.
                  </p>
                ) : null}

                <form
                  action={confirmCreditUsage.bind(null, customer.id)}
                  className="flex gap-2"
                >
                  <input type="hidden" name="wallet_id" value={wallet.id} />
                  <input type="hidden" name="amount" value={amountParam} />
                  <input type="hidden" name="note" value={noteParam} />
                  <input type="hidden" name="order_total" value={orderTotalParam} />
                  <Button type="submit">Confirmar</Button>
                  <a
                    href={`/painel/utilizacao/nova/${customer.id}`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Cancelar
                  </a>
                </form>
              </>
            )}
            {invalid ? (
              <a
                href={`/painel/utilizacao/nova/${customer.id}`}
                className={buttonVariants({ variant: "outline", className: "self-start" })}
              >
                Voltar
              </a>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Passos 3-4: identidade confirmada, saldo exibido, valor a debitar.
  return (
    <div className="flex flex-col gap-4">
      {backLink}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{customer.name}</CardTitle>
          <CardDescription>
            {formatCpf(customer.cpf)} · {customer.member_number}
            {planName ? ` · ${planName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Saldo disponível:{" "}
            <span className="text-xl font-bold text-primary">
              {formatCents(wallet.balance_cents)}
            </span>
          </p>

          {errorParam ? (
            <p className="text-sm text-destructive">{errorParam}</p>
          ) : null}

          <form className="flex flex-col gap-3">
            <CashbackUsageFields
              maxBalanceReais={(wallet.balance_cents / 100).toFixed(2)}
              cashbackEnabled={cashbackEnabled}
              cashbackPercentage={cashbackPercentage}
              cashbackMaxCents={cashbackMaxCents}
              hasPendingReferral={hasPendingReferral}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note">Observação (opcional)</Label>
              <Input id="note" name="note" placeholder="Ex: pedido #1234" />
            </div>
            <Button type="submit" className="self-start">
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
