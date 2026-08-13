import { requireStaff } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { user, role } = await requireStaff();

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
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
