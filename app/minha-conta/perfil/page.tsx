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
import { MembershipBadge } from "@/components/membership-badge";

const LEVEL_LABELS: Record<string, string> = {
  MEMBRO: "Membro",
  OURO: "Ouro",
  BLACK: "Black",
};

export default async function MeuPerfilPage() {
  const { customer: customerBasic } = await requireCustomer();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("name, email, phone, cpf, birth_date, member_number, membership_level, membership_since")
    .eq("id", customerBasic.id)
    .maybeSingle();

  const { data: historyData } = await supabase
    .from("membership_history")
    .select("level, started_at, ended_at")
    .eq("customer_id", customerBasic.id)
    .order("started_at", { ascending: false });
  const history = historyData ?? [];

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

      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Nível</CardTitle>
            <MembershipBadge level={customer?.membership_level ?? "MEMBRO"} />
          </div>
          <CardDescription>
            {customer?.membership_since
              ? `Nesse nível desde ${formatDate(customer.membership_since)}`
              : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{LEVEL_LABELS[h.level] ?? h.level}</span>{" "}
                  <span className="text-muted-foreground">
                    de {formatDate(h.started_at)} até{" "}
                    {h.ended_at ? formatDate(h.ended_at) : "hoje"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
