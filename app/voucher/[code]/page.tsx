import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getRequestIp } from "@/lib/request-ip";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";

const RATE_LIMIT_MAX_ATTEMPTS = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Página pública de resgate — sem login, aberta pelo link que vai junto do
 * código (WhatsApp, print, etc). Não redime nada: é só visualização, o
 * resgate de verdade continua exclusivo da tela do garçom (PIN + confirmação
 * presencial). Por ser pública e sem PIN, aplica o mesmo tipo de rate limit
 * por IP já usado em /api/garcom/voucher-avulso — aqui contando tentativas
 * de código inválido pra essa rota específica, pra não abrir uma porta mais
 * fácil de "adivinhar" um código válido do que a tela do garçom já é.
 */
export default async function VoucherPublicoPage({
  params,
}: PageProps<"/voucher/[code]">) {
  const { code } = await params;
  const admin = createAdminClient();
  const ip = await getRequestIp();

  if (ip) {
    const { count: recentFailures } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "PROMO_VOUCHER_PUBLIC_CODE_INVALID")
      .eq("ip_address", ip)
      .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());

    if ((recentFailures ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
      return (
        <VoucherShell>
          <p className="text-lg font-medium text-destructive">
            Muitas tentativas seguidas — aguarde um minuto e tente de novo.
          </p>
        </VoucherShell>
      );
    }
  }

  const { data: voucher } = await admin
    .from("promo_vouchers")
    .select("id, code, campaign_name, benefit_description, status, valid_until")
    .eq("code", code)
    .maybeSingle();

  if (!voucher) {
    await admin.from("audit_logs").insert({
      action: "PROMO_VOUCHER_PUBLIC_CODE_INVALID",
      entity: "promo_voucher",
      ip_address: ip,
    });
    return (
      <VoucherShell>
        <p className="text-lg font-medium text-destructive">Voucher não encontrado.</p>
      </VoucherShell>
    );
  }

  let status = voucher.status;
  if (status === "DISPONIVEL" && new Date(voucher.valid_until).getTime() < Date.now()) {
    await admin.from("promo_vouchers").update({ status: "EXPIRADO" }).eq("id", voucher.id);
    status = "EXPIRADO";
  }

  return (
    <VoucherShell>
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border-2 border-secondary bg-card p-6 text-center shadow-sm">
        <span className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold tracking-wide text-secondary uppercase">
          {voucher.campaign_name}
        </span>

        {status === "DISPONIVEL" ? (
          <>
            <div className="flex gap-2">
              {voucher.code.split("").map((digit: string, i: number) => (
                <div
                  key={i}
                  className="flex h-14 w-11 items-center justify-center rounded-lg border-2 border-secondary bg-secondary/10 text-3xl font-bold text-secondary"
                >
                  {digit}
                </div>
              ))}
            </div>
            <p className="text-lg font-semibold text-primary">{voucher.benefit_description}</p>
            <p className="text-sm text-muted-foreground">
              Válido até {formatDate(voucher.valid_until)}
            </p>
            <p className="text-sm text-muted-foreground">
              Apresente este código para o garçom na Neon Pizzaria.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-primary">{voucher.benefit_description}</p>
            <p className="text-base font-medium text-destructive">
              {status === "UTILIZADO"
                ? "Este voucher já foi utilizado."
                : status === "CANCELADO"
                  ? "Este voucher foi cancelado."
                  : "Este voucher expirou."}
            </p>
          </>
        )}
      </div>
    </VoucherShell>
  );
}

async function VoucherShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("price_cents, monthly_credit_cents")
    .eq("plan_type", "ESSENCIAL")
    .eq("active", true)
    .maybeSingle();

  const essencial = {
    monthlyPriceCents: plan?.price_cents ?? 3990,
    monthlyCreditCents: plan?.monthly_credit_cents ?? 8000,
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-background px-6 py-16 text-foreground">
      <span className="font-heading text-lg font-bold text-primary">Clube Neon</span>

      {children}

      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl bg-primary px-6 py-6 text-center text-primary-foreground">
        <p className="font-heading text-xl font-bold text-balance">
          Pague {formatCents(essencial.monthlyPriceCents)}{" "}
          <span className="text-secondary">
            e tenha {formatCents(essencial.monthlyCreditCents)} em créditos.
          </span>
        </p>
        <p className="text-sm text-primary-foreground/90">Todo mês, pra aproveitar na Neon.</p>
        <Link href="/#plano" className={buttonVariants({ variant: "secondary" })}>
          CONHECER O CLUBE NEON
        </Link>
      </div>
    </div>
  );
}
