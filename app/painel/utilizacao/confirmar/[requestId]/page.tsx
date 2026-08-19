import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { MembershipBadge } from "@/components/membership-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmCreditUseRequest, cancelCreditUseRequestByStaff } from "../../actions";

type RequestRow = {
  id: string;
  amount_cents: number;
  status: string;
  expires_at: string;
  token: string;
  wallet_id: string;
  customer: {
    id: string;
    name: string;
    member_number: string;
    membership_level: string;
  } | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConfirmarUtilizacaoPage({
  params,
  searchParams,
}: PageProps<"/painel/utilizacao/confirmar/[requestId]">) {
  await requireStaff();
  const { requestId } = await params;
  const sp = await searchParams;
  const token = first(sp.t) ?? "";
  const success = first(sp.success) === "1";
  const errorMessage = first(sp.error);

  const supabase = await createClient();
  const { data: requestData } = await supabase
    .from("credit_use_requests")
    .select(
      "id, amount_cents, status, expires_at, token, wallet_id, customer:customers(id, name, member_number, membership_level)",
    )
    .eq("id", requestId)
    .maybeSingle();
  const request = requestData as unknown as RequestRow | null;

  const backLink = (
    <a href="/painel/utilizacao/escanear" className={buttonVariants({ variant: "outline" })}>
      Próximo cliente
    </a>
  );

  if (!request) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>QR não encontrado</CardTitle>
          <CardDescription>Esse pedido de utilização não existe mais.</CardDescription>
        </CardHeader>
        <CardContent>{backLink}</CardContent>
      </Card>
    );
  }

  if (success) {
    const { data: transaction } = await supabase
      .from("credit_transactions")
      .select("balance_after_cents")
      .eq("wallet_id", request.wallet_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (
      <Card className="max-w-md border-secondary bg-secondary/10">
        <CardHeader>
          <CardTitle>✅ Utilização confirmada</CardTitle>
          <CardDescription>
            {request.customer?.name} · {formatCents(request.amount_cents)} debitados
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {transaction ? (
            <p className="text-sm text-primary">
              Saldo restante: {formatCents(transaction.balance_after_cents)}
            </p>
          ) : null}
          {backLink}
        </CardContent>
      </Card>
    );
  }

  if (request.status === "CONFIRMED") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Este QR já foi utilizado</CardTitle>
        </CardHeader>
        <CardContent>{backLink}</CardContent>
      </Card>
    );
  }

  if (request.status === "CANCELLED") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Este QR foi cancelado pelo cliente</CardTitle>
        </CardHeader>
        <CardContent>{backLink}</CardContent>
      </Card>
    );
  }

  const expiresAtMs = new Date(request.expires_at).getTime();
  const expired = request.status === "EXPIRED" || expiresAtMs < Date.now();
  if (expired) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Este QR expirou</CardTitle>
          <CardDescription>Peça ao cliente para gerar um novo QR Code.</CardDescription>
        </CardHeader>
        <CardContent>{backLink}</CardContent>
      </Card>
    );
  }

  if (request.token !== token) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Código do QR não confere</CardTitle>
          <CardDescription>Escaneie o QR novamente.</CardDescription>
        </CardHeader>
        <CardContent>{backLink}</CardContent>
      </Card>
    );
  }

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("balance_cents")
    .eq("id", request.wallet_id)
    .maybeSingle();
  const balanceCents = wallet?.balance_cents ?? 0;
  const balanceAfterCents = balanceCents - request.amount_cents;

  const { data: cycle } = await supabase
    .from("credit_wallets")
    .select("cycle:subscription_cycles(subscription:subscriptions(plan:plans(name)))")
    .eq("id", request.wallet_id)
    .maybeSingle();
  const planName =
    (cycle as unknown as { cycle: { subscription: { plan: { name: string } | null } | null } | null } | null)
      ?.cycle?.subscription?.plan?.name ?? "Clube Neon";

  const remainingSeconds = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const confirmAction = confirmCreditUseRequest.bind(null, request.id, token);
  const cancelAction = cancelCreditUseRequestByStaff.bind(null, request.id);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>🍕 Confirmar utilização</CardTitle>
        {errorMessage ? (
          <CardDescription className="text-destructive">{errorMessage}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted-foreground">Cliente: </span>
          {request.customer?.name ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Plano: </span>
          {planName}
        </p>
        <p className="flex items-center gap-2">
          <span className="text-muted-foreground">Membro: </span>
          {request.customer?.member_number}
          {request.customer ? <MembershipBadge level={request.customer.membership_level} /> : null}
        </p>
        <p>
          <span className="text-muted-foreground">Valor a debitar: </span>
          <span className="font-medium">{formatCents(request.amount_cents)}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Saldo atual: </span>
          {formatCents(balanceCents)}
        </p>
        <p>
          <span className="text-muted-foreground">Saldo após: </span>
          {formatCents(balanceAfterCents)}
        </p>
        <p className="text-muted-foreground">
          ⏱ Expira em: {minutes}:{seconds.toString().padStart(2, "0")}
        </p>

        <div className="mt-2 flex gap-2">
          <form action={cancelAction}>
            <Button type="submit" variant="outline">
              Cancelar
            </Button>
          </form>
          <form action={confirmAction}>
            <Button type="submit" variant="secondary">
              ✅ Confirmar
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
