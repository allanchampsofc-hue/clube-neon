import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
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
  await requireStaff();
  const { id } = await params;
  const { error, success } = await searchParams;

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

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{customer.name}</CardTitle>
          <CardDescription>Membro {customer.member_number}</CardDescription>
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
                defaultValue={formatCpf(customer.cpf)}
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
                </span>
              </div>
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
    </div>
  );
}
