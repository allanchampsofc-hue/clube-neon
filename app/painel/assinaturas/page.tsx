import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { addMonths } from "@/lib/dates";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
import { Button } from "@/components/ui/button";
import {
  activateSubscription,
  cancelSubscription,
  resumeSubscription,
  suspendSubscription,
  revertCancellation,
} from "./actions";

const STATUS_OPTIONS: SubscriptionStatus[] = [
  "PENDENTE",
  "ATIVA",
  "INADIMPLENTE",
  "SUSPENSA",
  "CANCELADA",
  "EXPIRADA",
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PainelAssinaturasPage({
  searchParams,
}: PageProps<"/painel/assinaturas">) {
  await requireStaff();
  const sp = await searchParams;
  const statusFilter = first(sp.status);

  const supabase = await createClient();
  let query = supabase
    .from("subscriptions")
    .select(
      "id, status, started_at, current_period_end, cancellation_effective_at, customer:customers(id, name, member_number), plan:plans(name, price_cents, duration_months)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data } = await query;

  // Sem Database schema gerado, o supabase-js tipa relações embutidas como
  // array mesmo sendo to-one (FK em subscriptions) — em runtime vem objeto.
  const subscriptions = (data ?? []) as unknown as Array<{
    id: string;
    status: SubscriptionStatus;
    started_at: string | null;
    current_period_end: string | null;
    cancellation_effective_at: string | null;
    customer: { id: string; name: string; member_number: string } | null;
    plan: { name: string; price_cents: number; duration_months: number } | null;
  }>;

  const customerIds = subscriptions
    .map((s) => s.customer?.id)
    .filter((id): id is string => Boolean(id));

  const balanceByCustomer = new Map<string, number>();
  if (customerIds.length > 0) {
    const { data: wallets } = await supabase
      .from("credit_wallets")
      .select("customer_id, balance_cents, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });
    for (const wallet of wallets ?? []) {
      if (!balanceByCustomer.has(wallet.customer_id)) {
        balanceByCustomer.set(wallet.customer_id, wallet.balance_cents);
      }
    }
  }

  const redirectTo = "/painel/assinaturas";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Assinaturas
      </h1>

      <form className="flex gap-2">
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {SUBSCRIPTION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Plano</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Início</th>
              <th className="px-3 py-2 font-medium">Término previsto</th>
              <th className="px-3 py-2 font-medium">Próxima cobrança</th>
              <th className="px-3 py-2 font-medium">Crédito disponível</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => {
              const contractEnd =
                subscription.started_at && subscription.plan
                  ? addMonths(subscription.started_at, subscription.plan.duration_months)
                  : null;
              const balance = subscription.customer
                ? balanceByCustomer.get(subscription.customer.id)
                : undefined;

              return (
                <tr key={subscription.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <a
                      href={`/painel/clientes/${subscription.customer?.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {subscription.customer?.name ?? "—"}
                    </a>
                    <span className="ml-1 text-muted-foreground">
                      {subscription.customer?.member_number}
                    </span>
                  </td>
                  <td className="px-3 py-2">{subscription.plan?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {subscription.plan ? formatCents(subscription.plan.price_cents) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {subscription.cancellation_effective_at ? (
                      <span className="text-destructive">
                        CANCELAMENTO AGENDADO
                        <br />
                        <span className="text-xs text-muted-foreground">
                          efetivo em {formatDate(subscription.cancellation_effective_at)}
                        </span>
                      </span>
                    ) : (
                      (SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status)
                    )}
                  </td>
                  <td className="px-3 py-2">{formatDate(subscription.started_at)}</td>
                  <td className="px-3 py-2">{formatDate(contractEnd)}</td>
                  <td className="px-3 py-2">{formatDate(subscription.current_period_end)}</td>
                  <td className="px-3 py-2">
                    {balance !== undefined ? formatCents(balance) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      {subscription.status === "PENDENTE" ? (
                        <form
                          action={activateSubscription.bind(
                            null,
                            redirectTo,
                            subscription.id,
                          )}
                        >
                          <Button type="submit" size="sm">
                            Ativar
                          </Button>
                        </form>
                      ) : null}
                      {subscription.status === "ATIVA" ? (
                        <form
                          action={suspendSubscription.bind(
                            null,
                            redirectTo,
                            subscription.id,
                          )}
                        >
                          <Button type="submit" size="sm" variant="outline">
                            Suspender
                          </Button>
                        </form>
                      ) : null}
                      {subscription.status === "SUSPENSA" ? (
                        <form
                          action={resumeSubscription.bind(
                            null,
                            redirectTo,
                            subscription.id,
                          )}
                        >
                          <Button type="submit" size="sm" variant="outline">
                            Reativar
                          </Button>
                        </form>
                      ) : null}
                      {subscription.cancellation_effective_at ? (
                        <form
                          action={revertCancellation.bind(
                            null,
                            redirectTo,
                            subscription.id,
                          )}
                        >
                          <Button type="submit" size="sm" variant="outline">
                            Reverter cancelamento
                          </Button>
                        </form>
                      ) : null}
                      {["ATIVA", "SUSPENSA", "INADIMPLENTE"].includes(
                        subscription.status,
                      ) ? (
                        <form
                          action={cancelSubscription.bind(
                            null,
                            redirectTo,
                            subscription.id,
                          )}
                        >
                          <Button type="submit" size="sm" variant="destructive">
                            Cancelar
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {subscriptions.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Nenhuma assinatura encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
