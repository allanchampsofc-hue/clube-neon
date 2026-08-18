import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getSiteOrigin } from "@/lib/site-url";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyReferralLink } from "@/components/copy-referral-link";

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Aguardando ativação",
  CREDITADO: "Crédito liberado",
  CANCELADO: "Cancelada",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDENTE: "outline",
  CREDITADO: "default",
  CANCELADO: "destructive",
};

export default async function IndicacoesPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const [{ data: customerData }, { data: config }, { data: referralsData }, origin] =
    await Promise.all([
      supabase.from("customers").select("referral_code").eq("id", customer.id).single(),
      supabase.from("system_config").select("referral_credit_cents").limit(1).maybeSingle(),
      supabase
        .from("referrals")
        .select("id, status, credited_at, created_at, referred:referred_customer_id(name)")
        .eq("referrer_customer_id", customer.id)
        .order("created_at", { ascending: false }),
      getSiteOrigin(),
    ]);

  const referralCode = customerData?.referral_code ?? "";
  const referralCreditCents = config?.referral_credit_cents ?? 3000;
  const referrals = (referralsData ?? []) as unknown as Array<{
    id: string;
    status: string;
    credited_at: string | null;
    created_at: string;
    referred: { name: string } | null;
  }>;
  const totalIndicacoes = referrals.length;
  const totalCreditadas = referrals.filter((r) => r.status === "CREDITADO").length;
  const referralLink = `${origin}?ref=${referralCode}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Indique um amigo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indique um amigo e vocês dois ganham {formatCents(referralCreditCents)}{" "}
          de crédito quando ele ativar a assinatura. Não acumula com outras
          promoções.
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="font-mono text-xl">{referralCode}</CardTitle>
          <CardDescription>Seu código de indicação</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="break-all text-sm text-muted-foreground">{referralLink}</p>
          <div>
            <CopyReferralLink link={referralLink} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Indicações realizadas</CardDescription>
            <CardTitle className="text-2xl">{totalIndicacoes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Crédito liberado</CardDescription>
            <CardTitle className="text-2xl">{totalCreditadas}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Indicado</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.referred?.name ?? "—"}</td>
                <td className="px-3 py-2">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATUS_BADGE_VARIANT[r.status]}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  Você ainda não indicou ninguém.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
