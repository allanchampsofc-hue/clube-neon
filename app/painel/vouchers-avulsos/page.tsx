import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import {
  PROMO_VOUCHER_STATUS_LABELS,
  PROMO_VOUCHER_PAYMENT_LABELS,
  type PromoVoucherStatus,
  type PromoVoucherPaymentMethod,
} from "@/lib/promo-vouchers";
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
import { cancelPromoVoucher } from "./actions";
import { getVoucherPublicUrl } from "@/lib/site-url";
import { CopyCodeButton } from "./copy-code-button";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type PromoVoucherRow = {
  id: string;
  code: string;
  campaign_name: string;
  benefit_description: string;
  price_paid_cents: number;
  payment_method: PromoVoucherPaymentMethod;
  buyer_name: string | null;
  buyer_phone: string | null;
  status: PromoVoucherStatus;
  created_at: string;
  valid_until: string;
  used_at: string | null;
  sent_at: string | null;
};

export default async function VouchersAvulsosPage({
  searchParams,
}: PageProps<"/painel/vouchers-avulsos">) {
  await requireManager();
  const sp = await searchParams;
  const status = first(sp.status);
  const campanha = first(sp.campanha);
  const generatedCodes = first(sp.generated)?.split(",").filter(Boolean) ?? [];

  const supabase = await createClient();

  const { data: generatedRows } =
    generatedCodes.length > 0
      ? await supabase
          .from("promo_vouchers")
          .select("id, code, sent_at")
          .in("code", generatedCodes)
      : { data: [] as Array<{ id: string; code: string; sent_at: string | null }> };
  const generatedLinks = await Promise.all(
    (generatedRows ?? []).map(async (row) => ({
      id: row.id,
      code: row.code,
      sentAt: row.sent_at,
      url: await getVoucherPublicUrl(row.code),
    })),
  );

  let query = supabase
    .from("promo_vouchers")
    .select(
      "id, code, campaign_name, benefit_description, price_paid_cents, payment_method, buyer_name, buyer_phone, status, created_at, valid_until, used_at, sent_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (status) query = query.eq("status", status);
  if (campanha) query = query.ilike("campaign_name", `%${campanha}%`);

  const { data } = await query;
  const vouchers = (data ?? []) as PromoVoucherRow[];

  const { count: activeCount } = await supabase
    .from("promo_vouchers")
    .select("id", { count: "exact", head: true })
    .eq("status", "DISPONIVEL");
  const { count: usedCount } = await supabase
    .from("promo_vouchers")
    .select("id", { count: "exact", head: true })
    .eq("status", "UTILIZADO");
  const { data: revenueRows } = await supabase
    .from("promo_vouchers")
    .select("price_paid_cents")
    .neq("status", "CANCELADO");
  const totalRevenueCents = (revenueRows ?? []).reduce((sum, r) => sum + r.price_paid_cents, 0);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (campanha) exportParams.set("campanha", campanha);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-primary">Vouchers avulsos</h1>
        <a href="/painel/vouchers-avulsos/novo" className={buttonVariants({ variant: "default" })}>
          + Gerar vouchers
        </a>
      </div>

      {generatedCodes.length > 0 ? (
        <Card className="border-secondary bg-secondary/10">
          <CardHeader>
            <CardTitle>
              {generatedCodes.length === 1
                ? "Código gerado com sucesso"
                : `${generatedCodes.length} códigos gerados com sucesso`}
            </CardTitle>
            <CardDescription>
              Anote, copie o link ou distribua os códigos abaixo — eles não aparecem de
              novo nesse destaque depois que você sair da página. Abrindo o link, o
              cliente já vê o código e o benefício numa página com a cara do Clube Neon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {generatedLinks.map(({ id, code, url, sentAt }) => (
                <div
                  key={code}
                  className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-secondary bg-background px-3 py-2"
                >
                  <span className="font-mono text-lg font-bold tracking-wider text-primary">
                    {code}
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-secondary underline underline-offset-4"
                  >
                    {url}
                  </a>
                  <CopyCodeButton voucherId={id} code={code} initialSent={Boolean(sentAt)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Disponíveis</CardDescription>
            <CardTitle className="text-2xl">{activeCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Utilizados</CardDescription>
            <CardTitle className="text-2xl">{usedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total vendido (bruto)</CardDescription>
            <CardTitle className="text-2xl">{formatCents(totalRevenueCents)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-3">
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
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campanha">Campanha</Label>
          <Input id="campanha" name="campanha" defaultValue={campanha ?? ""} placeholder="Buscar por nome" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        <a
          href={`/painel/vouchers-avulsos/export?${exportParams.toString()}`}
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
              <th className="px-3 py-2 font-medium">Campanha</th>
              <th className="px-3 py-2 font-medium">Benefício</th>
              <th className="px-3 py-2 font-medium">Pago</th>
              <th className="px-3 py-2 font-medium">Comprador</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Válido até</th>
              <th className="px-3 py-2 font-medium">Envio</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{v.code}</td>
                <td className="px-3 py-2">{v.campaign_name}</td>
                <td className="max-w-xs px-3 py-2 text-muted-foreground">{v.benefit_description}</td>
                <td className="px-3 py-2">
                  {formatCents(v.price_paid_cents)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {PROMO_VOUCHER_PAYMENT_LABELS[v.payment_method]}
                  </span>
                </td>
                <td className="px-3 py-2">{v.buyer_name ?? "—"}</td>
                <td className="px-3 py-2">{PROMO_VOUCHER_STATUS_LABELS[v.status]}</td>
                <td className="px-3 py-2">{formatDate(v.valid_until)}</td>
                <td className="px-3 py-2">
                  {v.status === "DISPONIVEL" ? (
                    <CopyCodeButton voucherId={v.id} code={v.code} initialSent={Boolean(v.sent_at)} />
                  ) : v.sent_at ? (
                    <span className="text-xs font-medium text-secondary">✓ Enviado</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {v.status === "DISPONIVEL" ? (
                    <form action={cancelPromoVoucher.bind(null, v.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                        Cancelar
                      </Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {vouchers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum voucher avulso encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
