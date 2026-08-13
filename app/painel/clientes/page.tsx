import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf, onlyDigits } from "@/lib/cpf";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

export default async function PainelClientesPage({
  searchParams,
}: PageProps<"/painel/clientes">) {
  await requireStaff();
  const { q: rawQ } = await searchParams;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ;

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, cpf, phone, member_number, active")
    .order("created_at", { ascending: false })
    .limit(50);

  const trimmed = q?.trim();
  if (trimmed) {
    // Remove vírgula/parênteses pra não quebrar (ou vazar) o filtro .or() do PostgREST.
    const safe = trimmed.replace(/[,()]/g, "");
    const digits = onlyDigits(trimmed);
    const orParts = [`name.ilike.%${safe}%`, `member_number.ilike.%${safe}%`];
    orParts.push(
      digits ? `cpf.ilike.%${digits}%` : `cpf.ilike.%${safe}%`,
      digits ? `phone.ilike.%${digits}%` : `phone.ilike.%${safe}%`,
    );
    query = query.or(orParts.join(","));
  }

  const { data: customers } = await query;

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

      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nome, CPF, telefone ou código de membro"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">CPF</th>
              <th className="px-3 py-2 font-medium">Telefone</th>
              <th className="px-3 py-2 font-medium">Membro</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).map((customer) => (
              <tr key={customer.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <a
                    href={`/painel/clientes/${customer.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {customer.name}
                  </a>
                </td>
                <td className="px-3 py-2">{formatCpf(customer.cpf)}</td>
                <td className="px-3 py-2">{customer.phone ?? "—"}</td>
                <td className="px-3 py-2">{customer.member_number}</td>
                <td className="px-3 py-2">
                  {customer.active ? "Ativo" : "Inativo"}
                </td>
              </tr>
            ))}
            {(customers ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={5}
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
