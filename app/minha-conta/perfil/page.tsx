import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCpf } from "@/lib/cpf";
import { formatDate } from "@/lib/dates";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MeuPerfilPage() {
  const { customer: customerBasic } = await requireCustomer();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("name, email, phone, cpf, birth_date, member_number")
    .eq("id", customerBasic.id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Meu Perfil
      </h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{customer?.name}</CardTitle>
          <CardDescription>Membro {customer?.member_number}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <p>
            <span className="text-muted-foreground">CPF: </span>
            {customer?.cpf ? formatCpf(customer.cpf) : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail: </span>
            {customer?.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Telefone: </span>
            {customer?.phone ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Data de nascimento: </span>
            {customer?.birth_date ? formatDate(customer.birth_date) : "—"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Pra atualizar seus dados, fale com a equipe da Neon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
