import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando envio",
  SENT: "Enviada",
  ANSWERED: "Respondida",
  FAILED: "Falha no envio",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  SENT: "secondary",
  ANSWERED: "default",
  FAILED: "destructive",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function scoreStars(score: number | null) {
  if (!score) return "—";
  return "⭐".repeat(score);
}

export default async function PainelSatisfacaoPage({
  searchParams,
}: PageProps<"/painel/satisfacao">) {
  await requireManager();
  const sp = await searchParams;
  const fromFilter = first(sp.from);
  const toFilter = first(sp.to);
  const minScoreFilter = first(sp.min_score);
  const statusFilter = first(sp.status);

  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: monthData } = await supabase
    .from("satisfaction_surveys")
    .select("score, status")
    .gte("created_at", monthStart.toISOString());
  const monthRows = monthData ?? [];
  const sentThisMonth = monthRows.filter((r) => r.status !== "PENDING").length;
  const answeredThisMonth = monthRows.filter((r) => r.score != null);
  const avgScore =
    answeredThisMonth.length > 0
      ? answeredThisMonth.reduce((sum, r) => sum + (r.score ?? 0), 0) / answeredThisMonth.length
      : null;
  const responseRate =
    sentThisMonth > 0 ? Math.round((answeredThisMonth.length / sentThisMonth) * 100) : 0;

  let query = supabase
    .from("satisfaction_surveys")
    .select(
      "id, score, status, sent_at, answered_at, created_at, customer:customer_id(name, member_number)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (fromFilter) query = query.gte("created_at", `${fromFilter}T00:00:00`);
  if (toFilter) query = query.lte("created_at", `${toFilter}T23:59:59`);
  if (minScoreFilter) query = query.gte("score", Number(minScoreFilter));
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data } = await query;
  const surveys = (data ?? []) as unknown as Array<{
    id: string;
    score: number | null;
    status: string;
    sent_at: string | null;
    answered_at: string | null;
    created_at: string;
    customer: { name: string; member_number: string } | null;
  }>;

  const exportParams = new URLSearchParams();
  if (fromFilter) exportParams.set("from", fromFilter);
  if (toFilter) exportParams.set("to", toFilter);
  if (minScoreFilter) exportParams.set("min_score", minScoreFilter);
  if (statusFilter) exportParams.set("status", statusFilter);
  const exportHref = `/api/satisfacao/export?${exportParams.toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-primary">
          Satisfação
        </h1>
        <a href={exportHref} className={buttonVariants({ variant: "secondary" })}>
          Exportar CSV
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Nota média do mês</CardDescription>
            <CardTitle className="text-2xl">
              {avgScore !== null ? avgScore.toFixed(1) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pesquisas enviadas no mês</CardDescription>
            <CardTitle className="text-2xl">{sentThisMonth}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Taxa de resposta</CardDescription>
            <CardTitle className="text-2xl">{responseRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" name="from" type="date" defaultValue={fromFilter ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={toFilter ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min_score">Nota mínima</Label>
          <select
            id="min_score"
            name="min_score"
            defaultValue={minScoreFilter ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos</option>
            {Object.keys(STATUS_LABELS).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Nota</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {surveys.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">{formatDate(s.created_at)}</td>
                <td className="px-3 py-2">
                  {s.customer?.name ?? "—"}{" "}
                  <span className="text-muted-foreground">{s.customer?.member_number}</span>
                </td>
                <td className="px-3 py-2">{scoreStars(s.score)}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_BADGE_VARIANT[s.status]}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {surveys.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma pesquisa encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
