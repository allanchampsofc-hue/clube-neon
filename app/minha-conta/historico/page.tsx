import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CREDIT_TRANSACTION_TYPE_LABELS, type CreditTransactionType } from "@/lib/credit-transactions";

export default async function HistoricoPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: ledgerData } = await supabase
    .from("credit_transactions")
    .select("id, type, amount_cents, reason, operator_id, created_at")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const ledger = ledgerData ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Histórico
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas {ledger.length} movimentações do seu crédito.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((tx) => (
              <tr key={tx.id} className="border-t border-border">
                <td className="px-3 py-2">{formatDate(tx.created_at)}</td>
                <td className="px-3 py-2">
                  {CREDIT_TRANSACTION_TYPE_LABELS[tx.type as CreditTransactionType] ?? tx.type}
                </td>
                <td
                  className={`px-3 py-2 ${tx.amount_cents < 0 ? "text-destructive" : "text-primary"}`}
                >
                  {tx.amount_cents > 0 ? "+" : ""}
                  {formatCents(tx.amount_cents)}
                </td>
                <td className="px-3 py-2">
                  {tx.operator_id ? "Atendimento Neon" : "Automático"}
                </td>
                <td className="px-3 py-2">{tx.reason ?? "—"}</td>
              </tr>
            ))}
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma movimentação ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
