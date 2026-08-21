import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import {
  VOUCHER_TYPE_LABELS,
  VOUCHER_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  type VoucherType,
  type VoucherStatus,
  type PlanType,
} from "@/lib/vouchers";
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

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type VoucherRow = {
  id: string;
  voucher_type: VoucherType;
  code: string;
  status: VoucherStatus;
  created_at: string;
  valid_until: string;
  used_at: string | null;
  customer: { name: string } | null;
  subscription: { plan: { name: string; plan_type: PlanType } | null } | null;
};

export default async function PainelVouchersPage({
  searchParams,
}: PageProps<"/painel/vouchers">) {
  await requireManager();
  const sp = await searchParams;
  const tipo = first(sp.tipo);
  const status = first(sp.status);
  const from = first(sp.from);
  const to = first(sp.to);

  const supabase = await createClient();

  let query = supabase
    .from("vouchers")
    .select(
      "id, voucher_type, code, status, created_at, valid_until, used_at, customer:customers(name), subscription:subscriptions(plan:plans(name, plan_type))",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (tipo) query = query.eq("voucher_type", tipo);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data } = await query;
  const vouchers = (data ?? []) as unknown as VoucherRow[];

  const currentMonth = new Date().toISOString().slice(0, 7);
  const { count: activeCount } = await supabase
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .eq("status", "DISPONIVEL");
  const { count: usedThisMonthCount } = await supabase
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .eq("status", "UTILIZADO")
    .gte("used_at", `${currentMonth}-01T00:00:00`);
  const { count: expiredCount } = await supabase
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .eq("status", "EXPIRADO");

  const exportParams = new URLSearchParams();
  if (tipo) exportParams.set("tipo", tipo);
  if (status) exportParams.set("status", status);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-primary">Vouchers</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Vouchers ativos</CardDescription>
            <CardTitle className="text-2xl">{activeCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Utilizados este mês</CardDescription>
            <CardTitle className="text-2xl">{usedThisMonthCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Expirados</CardDescription>
            <CardTitle className="text-2xl">{expiredCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={tipo ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="PIZZA_2X1">Pizza 2x1</option>
            <option value="FRETE_GRATIS">Frete grátis</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="DISPONIVEL">Disponível</option>
            <option value="UTILIZADO">Utilizado</option>
            <option value="EXPIRADO">Expirado</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        <a
          href={`/painel/vouchers/export?${exportParams.toString()}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Exportar CSV
        </a>
      </form>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Plano</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Gerado em</th>
              <th className="px-3 py-2 font-medium">Válido até</th>
              <th className="px-3 py-2 font-medium">Utilizado em</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{v.code}</td>
                <td className="px-3 py-2">{VOUCHER_TYPE_LABELS[v.voucher_type]}</td>
                <td className="px-3 py-2">{v.customer?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  {v.subscription?.plan ? PLAN_TYPE_LABELS[v.subscription.plan.plan_type] : "—"}
                </td>
                <td className="px-3 py-2">{VOUCHER_STATUS_LABELS[v.status]}</td>
                <td className="px-3 py-2">{formatDate(v.created_at)}</td>
                <td className="px-3 py-2">{formatDate(v.valid_until)}</td>
                <td className="px-3 py-2">{v.used_at ? formatDate(v.used_at) : "—"}</td>
              </tr>
            ))}
            {vouchers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum voucher encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
