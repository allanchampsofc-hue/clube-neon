import { requireStaff } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createCustomer } from "../actions";

export default async function NovoClientePage({
  searchParams,
}: PageProps<"/painel/clientes/novo">) {
  await requireStaff();
  const { error } = await searchParams;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Novo cliente</CardTitle>
        <CardDescription>
          O número de membro é gerado automaticamente ao salvar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCustomer} className="flex flex-col gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" name="cpf" placeholder="000.000.000-00" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birth_date">Data de nascimento</Label>
            <Input id="birth_date" name="birth_date" type="date" />
          </div>

          <Button type="submit" className="mt-2">
            Cadastrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
