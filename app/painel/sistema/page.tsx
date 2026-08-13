import { requireSuperAdmin } from "@/lib/auth";

export default async function PainelSistemaPage() {
  await requireSuperAdmin();

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Configurações do sistema
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Restrito a SUPER_ADMIN. Configurações críticas (planos, integrações,
        regras de crédito) chegam nas próximas etapas.
      </p>
    </div>
  );
}
