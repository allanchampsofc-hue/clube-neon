import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  FAILED: "Erro",
  PENDENTE: "Pendente",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  SENT: "default",
  FAILED: "destructive",
  PENDENTE: "outline",
};

export default async function PainelAniversariantesPage() {
  await requireStaff();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_birthdays_this_month");
  const birthdays = (data ?? []) as Array<{
    customer_id: string;
    name: string;
    member_number: string;
    birth_date: string;
    notification_status: string | null;
    sent_at: string | null;
  }>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Aniversariantes do mês
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assinantes ATIVA que fazem aniversário este mês e o status do
          WhatsApp automático.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Aniversário</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Notificado em</th>
            </tr>
          </thead>
          <tbody>
            {birthdays.map((b) => {
              const status = b.notification_status ?? "PENDENTE";
              return (
                <tr key={b.customer_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {b.name}{" "}
                    <span className="text-muted-foreground">{b.member_number}</span>
                  </td>
                  <td className="px-3 py-2">
                    {new Date(`${b.birth_date}T12:00:00`).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_BADGE_VARIANT[status]}>
                      {STATUS_LABELS[status] ?? status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{b.sent_at ? formatDate(b.sent_at) : "—"}</td>
                </tr>
              );
            })}
            {birthdays.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum aniversariante este mês.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
