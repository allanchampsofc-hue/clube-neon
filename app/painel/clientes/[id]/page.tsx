import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
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

  return (
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
            <p className="text-sm text-primary">Cliente atualizado com sucesso.</p>
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
  );
}
