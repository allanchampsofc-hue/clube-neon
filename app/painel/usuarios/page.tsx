import { requireAdmin } from "@/lib/auth";

export default async function PainelUsuariosPage() {
  await requireAdmin();

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-primary">
        Usuários
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Restrito a ADMIN e SUPER_ADMIN. Gestão de contas de staff chega na
        ETAPA 14.
      </p>
    </div>
  );
}
