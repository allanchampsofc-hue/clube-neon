import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/subscriptions";
import { Button } from "@/components/ui/button";
import {
  activateSubscription,
  cancelSubscription,
  resumeSubscription,
  suspendSubscription,
} from "./actions";

export default async function PainelAssinaturasPage() {
  await requireStaff();

  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "id, status, started_at, current_period_end, customer:customers(id, name, member_number), plan:plans(name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // Sem Database schema gerado, o supabase-js tipa relações embutidas como
  // array mesmo sendo to-one (FK em subscriptions) — em runtime vem objeto.
  const subscriptions = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    started_at: string | null;
    current_period_end: string | null;
    customer: { id: string; name: string; member_number: string } | null;
    plan: { name: string } | null;
  }>;

  const redirectTo = "/painel/assinaturas";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Assinaturas
      </h1>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Plano</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ciclo atual até</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(subscriptions ?? []).map((subscription) => (
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
                  {SUBSCRIPTION_STATUS_LABELS[
                    subscription.status as SubscriptionStatus
                  ] ?? subscription.status}
                </td>
                <td className="px-3 py-2">
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString(
                        "pt-BR",
                      )
                    : "—"}
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
            ))}
            {(subscriptions ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Nenhuma assinatura cadastrada ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
