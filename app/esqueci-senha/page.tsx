import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "./actions";

export default async function EsqueciSenhaPage({
  searchParams,
}: PageProps<"/esqueci-senha">) {
  const { error, success } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">
            Esqueci minha senha
          </CardTitle>
          <CardDescription>
            Informe seu e-mail e mandamos um link pra você definir uma senha
            nova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-primary">
                Se esse e-mail tiver uma conta no Clube Neon, enviamos um
                link de redefinição pra ele. Confira também a caixa de spam.
              </p>
              <a
                href="/login"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                ← Voltar pro login
              </a>
            </div>
          ) : (
            <form action={requestPasswordReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{String(error)}</p>
              ) : null}
              <Button type="submit" className="mt-2">
                Enviar link
              </Button>
              <a
                href="/login"
                className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Voltar pro login
              </a>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
