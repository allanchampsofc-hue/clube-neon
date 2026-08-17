import { requireStaff } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { user, role, roles } = await requireStaff();
  const isManager =
    roles.includes("GERENTE") || roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  const isSuperAdmin = roles.includes("SUPER_ADMIN");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-primary px-6 py-4 text-primary-foreground">
        <div>
          <p className="font-heading font-bold">Clube Neon — Painel</p>
          <p className="text-sm text-primary-foreground/70">
            {user.email} · {role}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Sair
          </Button>
        </form>
      </header>
      <nav className="flex gap-4 border-b border-border bg-card px-6 py-2 text-sm">
        <a href="/painel" className="hover:text-primary hover:underline">
          Dashboard
        </a>
        <a href="/painel/clientes" className="hover:text-primary hover:underline">
          Clientes
        </a>
        <a
          href="/painel/assinaturas"
          className="hover:text-primary hover:underline"
        >
          Assinaturas
        </a>
        <a
          href="/painel/utilizacao"
          className="hover:text-primary hover:underline"
        >
          Utilização
        </a>
        {isManager ? (
          <a
            href="/painel/relatorios"
            className="hover:text-primary hover:underline"
          >
            Relatórios
          </a>
        ) : null}
        {isAdmin ? (
          <a
            href="/painel/usuarios"
            className="hover:text-primary hover:underline"
          >
            Usuários
          </a>
        ) : null}
        {isSuperAdmin ? (
          <a
            href="/painel/sistema"
            className="hover:text-primary hover:underline"
          >
            Sistema
          </a>
        ) : null}
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
