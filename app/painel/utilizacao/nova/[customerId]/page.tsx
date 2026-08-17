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
  const errorParam = first(sp.error);
  const successParam = first(sp.success);

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

                <form
                  action={confirmCreditUsage.bind(null, customer.id)}
                  className="flex gap-2"
                >
                  <input type="hidden" name="wallet_id" value={wallet.id} />
                  <input type="hidden" name="amount" value={amountParam} />
                  <input type="hidden" name="note" value={noteParam} />
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Valor a debitar (R$)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={(wallet.balance_cents / 100).toFixed(2)}
                required
                autoFocus
              />
            </div>
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
