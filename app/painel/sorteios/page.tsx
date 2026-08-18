import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
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
import { updateDrawPrize, runDrawNow } from "./actions";

export default async function PainelSorteiosPage({
  searchParams,
}: PageProps<"/painel/sorteios">) {
  await requireManager();
  const { error, success } = await searchParams;

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("system_config")
    .select("next_draw_prize")
    .limit(1)
    .maybeSingle();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: drawsData } = await supabase
    .from("monthly_draws")
    .select(
      "id, month, prize_description, notified_at, winner:winner_customer_id(name, member_number)",
    )
    .order("month", { ascending: false })
    .limit(24);
  const draws = (drawsData ?? []) as unknown as Array<{
    id: string;
    month: string;
    prize_description: string;
    notified_at: string | null;
    winner: { name: string; member_number: string } | null;
  }>;

  const currentMonthDraw = draws.find((d) => d.month === currentMonth);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Sorteio mensal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo dia 1º, 1 assinante com pelo menos 30 dias de assinatura ATIVA
          é sorteado automaticamente — quem ganhou no mês anterior não
          concorre.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{String(error)}</p> : null}
      {success ? <p className="text-sm text-primary">Feito.</p> : null}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Sorteio deste mês ({currentMonth})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {currentMonthDraw ? (
            <div className="text-sm">
              <p>
                Ganhador:{" "}
                <span className="font-medium">
                  {currentMonthDraw.winner?.name ?? "—"}
                </span>{" "}
                {currentMonthDraw.winner?.member_number}
              </p>
              <p>Prêmio: {currentMonthDraw.prize_description}</p>
              <p className="text-muted-foreground">
                {currentMonthDraw.notified_at
                  ? `Notificado em ${formatDate(currentMonthDraw.notified_at)}`
                  : "WhatsApp ainda não enviado"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Ainda não houve sorteio este mês.
              </p>
              <form action={runDrawNow}>
                <Button type="submit" variant="secondary" size="sm">
                  Sortear agora
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Prêmio do próximo sorteio</CardTitle>
          <CardDescription>Usado quando nenhum prêmio for informado manualmente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateDrawPrize} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="next_draw_prize">Descrição do prêmio</Label>
              <Input
                id="next_draw_prize"
                name="next_draw_prize"
                defaultValue={config?.next_draw_prize ?? ""}
                required
              />
            </div>
            <Button type="submit">Salvar</Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 font-medium">Ganhador</th>
              <th className="px-3 py-2 font-medium">Prêmio</th>
              <th className="px-3 py-2 font-medium">Notificado</th>
            </tr>
          </thead>
          <tbody>
            {draws.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2">{d.month}</td>
                <td className="px-3 py-2">
                  {d.winner?.name ?? "—"}{" "}
                  <span className="text-muted-foreground">{d.winner?.member_number}</span>
                </td>
                <td className="px-3 py-2">{d.prize_description}</td>
                <td className="px-3 py-2">
                  {d.notified_at ? formatDate(d.notified_at) : "—"}
                </td>
              </tr>
            ))}
            {draws.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum sorteio registrado ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
