import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
import { buildCustomerSearchFilter } from "@/lib/customers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function UtilizacaoBuscaPage({
  searchParams,
}: PageProps<"/painel/utilizacao">) {
  await requireStaff();
  const { q: rawQ } = await searchParams;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ;
  const trimmed = q?.trim();

  const supabase = await createClient();
  let customers: Array<{
    id: string;
    name: string;
    cpf: string;
    member_number: string;
  }> = [];

  if (trimmed) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, cpf, member_number")
      .eq("active", true)
      .or(buildCustomerSearchFilter(trimmed))
      .limit(10);
    customers = data ?? [];
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Utilização de crédito
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busque o cliente por nome, CPF, telefone ou código de membro.
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Buscar cliente</CardTitle>
          <CardDescription>
            Confirme a identidade antes de debitar o crédito.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex gap-2">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nome, CPF, telefone ou membro"
              autoFocus
            />
            <Button type="submit">Buscar</Button>
          </form>

          {trimmed ? (
            <div className="flex flex-col gap-2">
              {customers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum cliente ativo encontrado.
                </p>
              ) : (
                customers.map((customer) => (
                  <a
                    key={customer.id}
                    href={`/painel/utilizacao/${customer.id}`}
                    className="flex flex-col rounded-lg border border-border p-3 text-sm hover:border-primary"
                  >
                    <span className="font-medium">{customer.name}</span>
                    <span className="text-muted-foreground">
                      {formatCpf(customer.cpf)} · {customer.member_number}
                    </span>
                  </a>
                ))
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
