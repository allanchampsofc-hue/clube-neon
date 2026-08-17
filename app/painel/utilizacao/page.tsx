import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PainelUtilizacaoPage({
  searchParams,
}: PageProps<"/painel/utilizacao">) {
  await requireStaff();
  const sp = await searchParams;
  const from = first(sp.from);
  const to = first(sp.to);
  const cliente = first(sp.cliente);

  const supabase = await createClient();
  let query = supabase
    .from("credit_transactions")
    .select(
      "id, amount_cents, reason, operator_id, created_at, customer:customers!inner(id, name, member_number)",
    )
    .eq("type", "UTILIZACAO")
    .order("created_at", { ascending: false })
    .limit(200);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (cliente) query = query.ilike("customer.name", `%${cliente}%`);

  const { data } = await query;

  // Sem Database schema gerado, o supabase-js tipa relações embutidas como
  // array mesmo sendo to-one (FK em credit_transactions) — em runtime vem objeto.
  const utilizacoes = (data ?? []) as unknown as Array<{
    id: string;
    amount_cents: number;
    reason: string | null;
    operator_id: string | null;
    created_at: string;
    customer: { id: string; name: string; member_number: string } | null;
  }>;

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (cliente) exportParams.set("cliente", cliente);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-primary">
          Utilização de crédito
        </h1>
        <a href="/painel/utilizacao/nova" className={buttonVariants()}>
          Nova utilização
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cliente">Cliente</Label>
          <Input
            id="cliente"
            name="cliente"
            placeholder="Nome do cliente"
            defaultValue={cliente ?? ""}
            className="max-w-xs"
          />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        <a
          href={`/painel/utilizacao/export?${exportParams.toString()}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Exportar CSV
        </a>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Valor debitado</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {utilizacoes.map((tx) => (
              <tr key={tx.id} className="border-t border-border">
                <td className="px-3 py-2">{formatDate(tx.created_at)}</td>
                <td className="px-3 py-2">
                  <a
                    href={`/painel/clientes/${tx.customer?.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {tx.customer?.name ?? "—"}
                  </a>
                  <span className="ml-1 text-muted-foreground">
                    {tx.customer?.member_number}
                  </span>
                </td>
                <td className="px-3 py-2 text-destructive">
                  {formatCents(tx.amount_cents)}
                </td>
                <td className="px-3 py-2">
                  {tx.operator_id ? "Atendimento Neon" : "Automático"}
                </td>
                <td className="px-3 py-2">{tx.reason ?? "—"}</td>
              </tr>
            ))}
            {utilizacoes.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Nenhuma utilização encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
