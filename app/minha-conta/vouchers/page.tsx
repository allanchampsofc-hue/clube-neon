import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  VOUCHER_TYPE_LABELS,
  VOUCHER_STATUS_LABELS,
  PIZZA_2X1_RULES,
  FRETE_GRATIS_RULES,
  type VoucherType,
  type VoucherStatus,
} from "@/lib/vouchers";
import { RulesDialog } from "./rules-dialog";

const RULES: Record<VoucherType, string> = {
  PIZZA_2X1: PIZZA_2X1_RULES,
  FRETE_GRATIS: FRETE_GRATIS_RULES,
};

type VoucherRow = {
  id: string;
  voucher_type: VoucherType;
  code: string;
  status: VoucherStatus;
  valid_until: string;
  used_at: string | null;
};

function VoucherCard({ voucher }: { voucher: VoucherRow }) {
  const isAvailable = voucher.status === "DISPONIVEL";
  return (
    <Card className={isAvailable ? "border-2 border-secondary" : "opacity-60 grayscale"}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{VOUCHER_TYPE_LABELS[voucher.voucher_type]}</CardTitle>
          <Badge variant={isAvailable ? "secondary" : "outline"}>
            {VOUCHER_STATUS_LABELS[voucher.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {voucher.voucher_type === "PIZZA_2X1" ? (
          <div>
            <p className="text-xs text-muted-foreground">Código</p>
            <div className="mt-1 flex gap-2">
              {voucher.code.split("").map((digit, i) => (
                <div
                  key={i}
                  className="flex h-14 w-11 items-center justify-center rounded-lg border-2 border-secondary bg-secondary/10 text-3xl font-bold text-secondary"
                >
                  {digit}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">Cupom</p>
            <p className="font-heading text-xl font-bold text-secondary">{voucher.code}</p>
          </div>
        )}

        <p className="text-sm">
          <span className="text-muted-foreground">Válido até: </span>
          {formatDate(voucher.valid_until)}
        </p>
        <p className="text-sm text-muted-foreground">
          {voucher.voucher_type === "PIZZA_2X1"
            ? "Apresente este código ao atendente da Neon"
            : "Use este cupom no seu pedido de entrega"}
        </p>
        {voucher.used_at ? (
          <p className="text-xs text-muted-foreground">
            Utilizado em {formatDate(voucher.used_at)}
          </p>
        ) : null}

        <RulesDialog voucherType={voucher.voucher_type} rules={RULES[voucher.voucher_type]} />
      </CardContent>
    </Card>
  );
}

export default async function VouchersPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data } = await supabase
    .from("vouchers")
    .select("id, voucher_type, code, status, valid_until, used_at")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });
  const vouchers = (data ?? []) as VoucherRow[];

  const available = vouchers.filter((v) => v.status === "DISPONIVEL");
  const others = vouchers.filter((v) => v.status !== "DISPONIVEL");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold text-primary">Seus vouchers</h1>

      <div>
        <h2 className="mb-3 font-heading text-lg font-bold text-foreground">Disponíveis</h2>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum voucher disponível no momento.
          </p>
        ) : (
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            {available.map((v) => (
              <VoucherCard key={v.id} voucher={v} />
            ))}
          </div>
        )}
      </div>

      {others.length > 0 ? (
        <div>
          <h2 className="mb-3 font-heading text-lg font-bold text-foreground">
            Utilizados / Expirados
          </h2>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            {others.map((v) => (
              <VoucherCard key={v.id} voucher={v} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
