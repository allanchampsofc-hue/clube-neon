import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
import { formatDate, addMonths } from "@/lib/dates";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MembershipBadge } from "@/components/membership-badge";
import { changeOwnPassword } from "./actions";
import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";

const LEVEL_LABELS: Record<string, string> = {
  MEMBRO: "Membro",
  OURO: "Ouro",
  BLACK: "Black",
};

export default async function MeuPerfilPage({
  searchParams,
}: PageProps<"/minha-conta/perfil">) {
  const { customer: customerBasic } = await requireCustomer();
  const {
    pwd_error: pwdError,
    pwd_success: pwdSuccess,
    cancel_error: cancelError,
    cancel_success: cancelSuccess,
  } = await searchParams;
  const supabase = await createClient();

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select(
      "status, payment_type, started_at, cancellation_requested_at, cancellation_effective_at, plan:plans(duration_months)",
    )
    .eq("customer_id", customerBasic.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = subscriptionData as unknown as {
    status: string;
    payment_type: "MONTHLY" | "ANNUAL";
    started_at: string | null;
    cancellation_requested_at: string | null;
    cancellation_effective_at: string | null;
    plan: { duration_months: number } | null;
  } | null;
  const naturalContractEnd =
    subscription?.started_at && subscription.plan
      ? addMonths(subscription.started_at, subscription.plan.duration_months)
      : null;

  const { data: config } = await supabase
    .from("system_config")
    .select("monthly_price_cents")
    .limit(1)
    .maybeSingle();
  const monthlyPriceCents = config?.monthly_price_cents ?? 4990;

  const { data: customer } = await supabase
    .from("customers")
    .select("name, email, phone, cpf, birth_date, member_number, membership_level, membership_since")
    .eq("id", customerBasic.id)
    .maybeSingle();

  const { data: historyData } = await supabase
    .from("membership_history")
    .select("level, started_at, ended_at")
    .eq("customer_id", customerBasic.id)
    .order("started_at", { ascending: false });
  const history = historyData ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Meu Perfil
      </h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{customer?.name}</CardTitle>
          <CardDescription>Membro {customer?.member_number}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <p>
            <span className="text-muted-foreground">CPF: </span>
            {customer?.cpf ? formatCpf(customer.cpf) : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail: </span>
            {customer?.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Telefone: </span>
            {customer?.phone ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Data de nascimento: </span>
            {customer?.birth_date ? formatDate(customer.birth_date) : "—"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Pra atualizar seus dados, fale com a equipe da Neon.
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Nível</CardTitle>
            <MembershipBadge level={customer?.membership_level ?? "MEMBRO"} />
          </div>
          <CardDescription>
            {customer?.membership_since
              ? `Nesse nível desde ${formatDate(customer.membership_since)}`
              : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{LEVEL_LABELS[h.level] ?? h.level}</span>{" "}
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

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Informe a senha atual para escolher uma nova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changeOwnPassword} className="flex flex-col gap-4">
            {pwdError ? (
              <p className="text-sm text-destructive">{String(pwdError)}</p>
            ) : null}
            {pwdSuccess ? (
              <p className="text-sm text-primary">Senha alterada com sucesso.</p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current_password">Senha atual</Label>
              <Input
                id="current_password"
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
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
            <Button type="submit" className="mt-2">
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {subscription?.status === "ATIVA" ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Assinatura</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cancelError ? (
              <p className="text-sm text-destructive">{String(cancelError)}</p>
            ) : null}
            {cancelSuccess ? (
              <p className="text-sm text-primary">
                Cancelamento confirmado, {customer?.name}.
              </p>
            ) : null}
            {subscription.cancellation_requested_at ? (
              <p className="text-sm text-muted-foreground">
                {subscription.payment_type === "ANNUAL"
                  ? `Cancelamento registrado. Seu crédito mensal segue normalmente até ${formatDate(naturalContractEnd)}. Nenhum valor será devolvido.`
                  : `Cancelamento agendado — sua participação encerra em ${formatDate(subscription.cancellation_effective_at)}.`}
              </p>
            ) : (
              <CancelSubscriptionDialog
                paymentType={subscription.payment_type}
                monthlyPriceCents={monthlyPriceCents}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
