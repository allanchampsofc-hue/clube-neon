import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf, maskCpf } from "@/lib/cpf";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
import {
  CREDIT_TRANSACTION_TYPE_LABELS,
  type CreditTransactionType,
} from "@/lib/credit-transactions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { updateCustomer } from "../actions";
import { adjustCredit } from "../credit-actions";
import { AdvancedCreditDialog } from "./advanced-credit-dialog";
import { resetCustomerPassword } from "./password-actions";
import { MembershipBadge } from "@/components/membership-badge";
import {
  activateSubscription,
  cancelSubscription,
  createSubscription,
  resumeSubscription,
  suspendSubscription,
} from "../../assinaturas/actions";

export default async function ClienteDetalhePage({
  params,
  searchParams,
}: PageProps<"/painel/clientes/[id]">) {
  const { roles } = await requireStaff();
  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  const isManager = isAdmin || roles.includes("GERENTE");
  const { id } = await params;
  const {
    error,
    success,
    adv_error: advError,
    adv_success: advSuccess,
    pwd_error: pwdError,
    pwd_success: pwdSuccess,
  } = await searchParams;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!customer) {
    return (
      <p className="text-sm text-destructive">
        Cliente não encontrado.
      </p>
    );
  }

  const { data: subscriptionsData } = await supabase
    .from("subscriptions")
    .select("id, status, started_at, current_period_end, plan:plans(name)")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  // Sem Database schema gerado, o supabase-js tipa relações embutidas como
  // array mesmo sendo to-one (FK em subscriptions) — em runtime vem objeto.
  const subscriptions = (subscriptionsData ?? []) as unknown as Array<{
    id: string;
    status: string;
    started_at: string | null;
    current_period_end: string | null;
    plan: { name: string } | null;
  }>;

  const redirectTo = `/painel/clientes/${customer.id}`;
  const hasOpenSubscription = subscriptions.some((s) =>
    ["PENDENTE", "ATIVA", "INADIMPLENTE", "SUSPENSA"].includes(s.status),
  );

  const activeSubscription = subscriptions.find((s) => s.status === "ATIVA");
  let isInGracePeriod = false;
  if (activeSubscription) {
    const { data: latestCycle } = await supabase
      .from("subscription_cycles")
      .select("is_grace_period")
      .eq("subscription_id", activeSubscription.id)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    isInGracePeriod = latestCycle?.is_grace_period ?? false;
  }

  let membershipMonths = 0;
  if (activeSubscription) {
    const { count } = await supabase
      .from("subscription_cycles")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", activeSubscription.id);
    membershipMonths = count ?? 0;
  }

  const { data: membershipHistoryData } = await supabase
    .from("membership_history")
    .select("level, started_at, ended_at")
    .eq("customer_id", customer.id)
    .order("started_at", { ascending: false });
  const membershipHistory = membershipHistoryData ?? [];

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("id, balance_cents")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
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

  const { data: ledgerData } = await supabase
    .from("credit_transactions")
    .select("id, type, amount_cents, reason, created_at")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const ledger = (ledgerData ?? []) as Array<{
    id: string;
    type: string;
    amount_cents: number;
    reason: string | null;
    created_at: string;
  }>;

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{customer.name}</CardTitle>
            <MembershipBadge level={customer.membership_level ?? "MEMBRO"} />
          </div>
          <CardDescription>
            Membro {customer.member_number} · CPF {maskCpf(customer.cpf)} ·
            Membro desde {formatDate(customer.created_at)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={updateCustomer.bind(null, customer.id)}
            className="flex flex-col gap-4"
          >
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {success ? (
              <p className="text-sm text-primary">Salvo com sucesso.</p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" defaultValue={customer.name} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                name="cpf"
                defaultValue={customer.cpf ? formatCpf(customer.cpf) : ""}
                placeholder="000.000.000-00"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={customer.email ?? ""}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={customer.phone ?? ""}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birth_date">Data de nascimento</Label>
              <Input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={customer.birth_date ?? ""}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="active" name="active" defaultChecked={customer.active} />
              <Label htmlFor="active">Cliente ativo</Label>
            </div>

            <Button type="submit" className="mt-2">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Assinatura</CardTitle>
          <CardDescription>
            O Clube Neon tem um plano único — cada cliente tem no máximo uma
            assinatura pendente ou ativa por vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(subscriptions ?? []).map((subscription) => (
            <div
              key={subscription.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {subscription.plan?.name ?? "Plano"}
                </span>
                <span className="text-muted-foreground">
                  {SUBSCRIPTION_STATUS_LABELS[
                    subscription.status as SubscriptionStatus
                  ] ?? subscription.status}
                  {subscription.status === "ATIVA" && isInGracePeriod ? (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      Em carência
                    </span>
                  ) : null}
                </span>
              </div>
              {subscription.status === "ATIVA" && isInGracePeriod ? (
                <p className="text-muted-foreground">
                  Contrato concluído — saldo remanescente disponível até o
                  fim do período de carência.
                </p>
              ) : null}
              {subscription.current_period_end ? (
                <p className="text-muted-foreground">
                  Ciclo atual até{" "}
                  {new Date(subscription.current_period_end).toLocaleDateString(
                    "pt-BR",
                  )}
                </p>
              ) : null}

              <div className="flex gap-2">
                {subscription.status === "PENDENTE" ? (
                  <form action={activateSubscription.bind(null, redirectTo, subscription.id)}>
                    <Button type="submit" size="sm">
                      Ativar
                    </Button>
                  </form>
                ) : null}
                {subscription.status === "ATIVA" ? (
                  <form action={suspendSubscription.bind(null, redirectTo, subscription.id)}>
                    <Button type="submit" size="sm" variant="outline">
                      Suspender
                    </Button>
                  </form>
                ) : null}
                {subscription.status === "SUSPENSA" ? (
                  <form action={resumeSubscription.bind(null, redirectTo, subscription.id)}>
                    <Button type="submit" size="sm" variant="outline">
                      Reativar
                    </Button>
                  </form>
                ) : null}
                {["ATIVA", "SUSPENSA", "INADIMPLENTE"].includes(subscription.status) ? (
                  <form action={cancelSubscription.bind(null, redirectTo, subscription.id)}>
                    <Button type="submit" size="sm" variant="destructive">
                      Cancelar
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}

          {!hasOpenSubscription ? (
            <form action={createSubscription.bind(null, customer.id)}>
              <Button type="submit" variant="secondary">
                Criar assinatura (Clube Neon)
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Nível</CardTitle>
            <MembershipBadge level={customer.membership_level ?? "MEMBRO"} />
          </div>
          <CardDescription>
            {activeSubscription
              ? `${membershipMonths} ${membershipMonths === 1 ? "mês" : "meses"} consecutivo${membershipMonths === 1 ? "" : "s"} de assinatura ATIVA`
              : "Sem assinatura ativa no momento"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membershipHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {membershipHistory.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{h.level}</span>{" "}
                  <span className="text-muted-foreground">
                    de {formatDate(h.started_at)} até{" "}
                    {h.ended_at ? formatDate(h.ended_at) : "hoje"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isManager ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>
              Use quando o cliente esquecer a senha. Confirme a identidade
              dele antes (nome, CPF, número de membro) — essa ação fica
              registrada na auditoria com o seu usuário.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!customer.user_id ? (
              <p className="text-sm text-muted-foreground">
                Esse cliente não tem login vinculado — não há senha pra
                redefinir.
              </p>
            ) : (
              <form
                action={resetCustomerPassword.bind(null, customer.id)}
                className="flex flex-col gap-4"
              >
                {pwdError ? (
                  <p className="text-sm text-destructive">{String(pwdError)}</p>
                ) : null}
                {pwdSuccess ? (
                  <p className="text-sm text-primary">
                    Senha redefinida. Informe a nova senha ao cliente e peça
                    que ele a troque em Meu Perfil.
                  </p>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new_password">Nova senha</Label>
                  <Input
                    id="new_password"
                    name="new_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" variant="outline" className="self-start">
                  Redefinir senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Crédito</CardTitle>
          <CardDescription>
            Saldo da carteira do ciclo atual e histórico de movimentações.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!wallet ? (
            <p className="text-sm text-muted-foreground">
              Cliente ainda não tem carteira de crédito — ative a assinatura
              acima pra liberar o crédito mensal.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-primary">
                  {formatCents(wallet.balance_cents)}
                </p>
                {isAdmin ? (
                  <AdvancedCreditDialog customerId={customer.id} />
                ) : null}
              </div>

              {pendingCashbackCents > 0 ? (
                <p className="text-sm text-secondary-foreground">
                  💰 Cashback pendente: {formatCents(pendingCashbackCents)} (cai no
                  próximo ciclo)
                </p>
              ) : null}

              {advError ? (
                <p className="text-sm text-destructive">{advError}</p>
              ) : null}
              {advSuccess ? (
                <p className="text-sm text-primary">
                  Ajuste avançado registrado com sucesso.
                </p>
              ) : null}

              <form
                action={adjustCredit.bind(null, customer.id)}
                className="flex flex-col gap-3 rounded-lg border border-border p-3"
              >
                <p className="text-sm font-medium">Ajuste manual</p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amount_reais">
                    Valor (R$, use negativo pra debitar)
                  </Label>
                  <Input
                    id="amount_reais"
                    name="amount_reais"
                    type="number"
                    step="0.01"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason">Motivo</Label>
                  <Input id="reason" name="reason" required />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="self-start"
                >
                  Aplicar ajuste
                </Button>
              </form>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Histórico</p>
                {ledger.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma movimentação ainda.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {ledger.map((tx) => (
                      <li
                        key={tx.id}
                        className="flex items-center justify-between border-t border-border pt-1"
                      >
                        <span>
                          {CREDIT_TRANSACTION_TYPE_LABELS[
                            tx.type as CreditTransactionType
                          ] ?? tx.type}
                          {tx.reason ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {tx.reason}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            tx.amount_cents < 0
                              ? "text-destructive"
                              : "text-primary"
                          }
                        >
                          {tx.amount_cents > 0 ? "+" : ""}
                          {formatCents(tx.amount_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
