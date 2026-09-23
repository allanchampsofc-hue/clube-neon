import { type NextRequest } from "next/server";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { buildCsv, csvEscape, csvResponse } from "@/lib/csv";
import {
  PROMO_VOUCHER_STATUS_LABELS,
  PROMO_VOUCHER_PAYMENT_LABELS,
  type PromoVoucherStatus,
  type PromoVoucherPaymentMethod,
} from "@/lib/promo-vouchers";

export async function GET(request: NextRequest) {
  await requireManager();

  const status = request.nextUrl.searchParams.get("status");
  const campanha = request.nextUrl.searchParams.get("campanha");

  const supabase = await createClient();
  let query = supabase
    .from("promo_vouchers")
    .select(
      "code, campaign_name, benefit_description, price_paid_cents, payment_method, buyer_name, buyer_phone, status, created_at, valid_until, used_at, sent_at",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (status) query = query.eq("status", status);
  if (campanha) query = query.ilike("campaign_name", `%${campanha}%`);

  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<{
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
  }>;

  const csv = buildCsv(
    [
      "Código",
      "Campanha",
      "Benefício",
      "Preço pago",
      "Forma de pagamento",
      "Comprador",
      "WhatsApp",
      "Status",
      "Gerado em",
      "Válido até",
      "Utilizado em",
      "Enviado ao cliente",
    ],
    rows.map((r) => [
      csvEscape(r.code),
      csvEscape(r.campaign_name),
      csvEscape(r.benefit_description),
      csvEscape(formatCents(r.price_paid_cents)),
      csvEscape(PROMO_VOUCHER_PAYMENT_LABELS[r.payment_method]),
      csvEscape(r.buyer_name ?? ""),
      csvEscape(r.buyer_phone ?? ""),
      csvEscape(PROMO_VOUCHER_STATUS_LABELS[r.status]),
      csvEscape(formatDate(r.created_at)),
      csvEscape(formatDate(r.valid_until)),
      csvEscape(r.used_at ? formatDate(r.used_at) : ""),
      csvEscape(r.sent_at ? formatDate(r.sent_at) : "Não"),
    ]),
  );

  return csvResponse(csv, "vouchers-avulsos.csv");
}
