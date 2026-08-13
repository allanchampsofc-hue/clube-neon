import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { Button, buttonVariants } from "@/components/ui/button";

export default async function NaoAutorizadoPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-heading text-2xl font-bold text-primary">
        Acesso não autorizado
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Sua conta não tem permissão para acessar essa área do Clube Neon.
        {user ? " Se isso for um engano, fale com um administrador." : ""}
      </p>
      {user ? (
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sair
          </Button>
        </form>
      ) : (
        <a href="/login" className={buttonVariants()}>
          Ir para o login
        </a>
      )}
    </div>
  );
}
