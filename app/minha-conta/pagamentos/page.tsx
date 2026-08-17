import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/payments-status";

export default async function PagamentosPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customer.id);

  const subscriptionIds = (subscriptions ?? []).map((s) => s.id);

  const { data: paymentsData } =
    subscriptionIds.length > 0
      ? await supabase
          .from("payments")
          .select("id, amount_cents, status, paid_at, created_at")
          .in("subscription_id", subscriptionIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  const payments = paymentsData ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Pagamentos
      </h1>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {formatDate(payment.paid_at ?? payment.created_at)}
                </td>
                <td className="px-3 py-2">{formatCents(payment.amount_cents)}</td>
                <td className="px-3 py-2">
                  {PAYMENT_STATUS_LABELS[payment.status as PaymentStatus] ?? payment.status}
                </td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum pagamento registrado ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
