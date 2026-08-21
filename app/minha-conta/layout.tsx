import { requireCustomer } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/minha-conta", label: "Início" },
  { href: "/minha-conta/credito", label: "Meu Crédito" },
  { href: "/minha-conta/vouchers", label: "Meus Vouchers" },
  { href: "/minha-conta/historico", label: "Histórico" },
  { href: "/minha-conta/indicacoes", label: "Indique um amigo" },
  { href: "/minha-conta/perfil", label: "Meu Perfil" },
  { href: "/minha-conta/pagamentos", label: "Pagamentos" },
  { href: "/minha-conta/ajuda", label: "Ajuda" },
];

export default async function MinhaContaLayout({
  children,
}: LayoutProps<"/minha-conta">) {
  const { customer } = await requireCustomer();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-primary px-6 py-4 text-primary-foreground">
        <div>
          <p className="font-heading font-bold">Clube Neon</p>
          <p className="text-sm text-primary-foreground/70">
            {customer.name} · {customer.member_number}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Sair
          </Button>
        </form>
      </header>
      <nav className="flex flex-wrap gap-4 border-b border-border bg-card px-6 py-2 text-sm">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="hover:text-primary hover:underline"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
