import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsarCreditoFlow } from "./usar-credito-flow";

export default async function UsarCreditoPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("balance_cents")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const balanceCents = wallet?.balance_cents ?? 0;

  if (subscriptionData?.status !== "ATIVA" || balanceCents <= 0) {
    redirect("/minha-conta");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">
          Usar crédito agora
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gere um QR Code e mostre pro garçom pra debitar na hora.
        </p>
      </div>
      <UsarCreditoFlow
        balanceCents={balanceCents}
        customerFirstName={customer.name.split(" ")[0]}
      />
    </div>
  );
}
