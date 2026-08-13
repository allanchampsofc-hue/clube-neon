import { requireCustomer } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default async function ContaLayout({
  children,
}: LayoutProps<"/conta">) {
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
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
