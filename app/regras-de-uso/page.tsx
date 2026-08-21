import { PIZZA_2X1_RULES, FRETE_GRATIS_RULES } from "@/lib/vouchers";

export default function RegrasDeUsoPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <a href="/" className="text-sm text-primary underline underline-offset-4">
        ← Voltar
      </a>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Regras de uso dos vouchers
      </h1>

      <div className="flex flex-col gap-4 text-sm text-foreground">
        <h2 className="font-heading text-lg font-bold">🍕 Voucher Pizza 2x1</h2>
        <p>{PIZZA_2X1_RULES}</p>

        <h2 className="font-heading text-lg font-bold">🛵 Cupom Frete Grátis</h2>
        <p>{FRETE_GRATIS_RULES}</p>
      </div>
    </div>
  );
}
