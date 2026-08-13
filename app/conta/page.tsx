import { requireCustomer } from "@/lib/auth";

export default async function ContaPage() {
  const { customer } = await requireCustomer();

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Olá, {customer.name}!
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu crédito, histórico e cartão de membro chegam nas próximas
        etapas.
      </p>
    </div>
  );
}
