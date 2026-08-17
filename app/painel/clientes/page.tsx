import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { buildCustomerSearchFilter } from "@/lib/customers";
import {
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/subscriptions";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

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

export default async function PainelClientesPage({
  searchParams,
}: PageProps<"/painel/clientes">) {
  await requireStaff();
  const sp = await searchParams;
  const q = first(sp.q);
  const statusFilter = first(sp.status);

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, email, cpf, phone, member_number, active, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const trimmed = q?.trim();
  if (trimmed) {
    query = query.or(buildCustomerSearchFilter(trimmed));
  }

  const { data: customersData } = await query;
  const customers = customersData ?? [];

  // Status da assinatura não é coluna de customers — busca em lote e pega a
  // mais recente de cada cliente (segue o mesmo padrão já usado no perfil).
  const customerIds = customers.map((c) => c.id);
  const statusByCustomer = new Map<string, SubscriptionStatus>();
  if (customerIds.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("customer_id, status, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });
    for (const sub of subs ?? []) {
      if (!statusByCustomer.has(sub.customer_id)) {
        statusByCustomer.set(sub.customer_id, sub.status as SubscriptionStatus);
      }
    }
  }

  const rows = customers
    .map((customer) => ({
      ...customer,
      subscriptionStatus: statusByCustomer.get(customer.id) ?? null,
    }))
    .filter((row) => !statusFilter || row.subscriptionStatus === statusFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-primary">
          Clientes
        </h1>
        <a href="/painel/clientes/novo" className={buttonVariants()}>
          Novo cliente
        </a>
      </div>

      <form className="flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nome, e-mail, CPF, telefone ou código de membro"
          className="max-w-sm"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Todas as assinaturas</option>
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
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">Telefone</th>
              <th className="px-3 py-2 font-medium">Membro</th>
              <th className="px-3 py-2 font-medium">Assinatura</th>
              <th className="px-3 py-2 font-medium">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <a
                    href={`/painel/clientes/${customer.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {customer.name}
                  </a>
                </td>
                <td className="px-3 py-2">{customer.email ?? "—"}</td>
                <td className="px-3 py-2">{customer.phone ?? "—"}</td>
                <td className="px-3 py-2">{customer.member_number}</td>
                <td className="px-3 py-2">
                  {customer.subscriptionStatus
                    ? SUBSCRIPTION_STATUS_LABELS[customer.subscriptionStatus]
                    : "Sem assinatura"}
                </td>
                <td className="px-3 py-2">{formatDate(customer.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
