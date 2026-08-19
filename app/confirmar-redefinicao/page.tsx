"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Página intermediária do fluxo de redefinição de senha.
 *
 * Existe por causa do scanner de links do Gmail: ele faz uma requisição
 * automática pros links do e-mail antes do usuário clicar, e como o link
 * de recuperação é de uso único, isso o consumia — o usuário sempre
 * recebia "link inválido ou expirado". Aqui nada acontece no carregamento
 * da página: a verificação só roda quando alguém clica no botão de
 * verdade, e scanner nenhum clica em botão.
 *
 * Usa verifyOtp com token_hash em vez do fluxo PKCE (?code=), o que
 * também remove a exigência de abrir o link no MESMO navegador que pediu
 * a redefinição — não depende do cookie code_verifier.
 */
function createConfirmClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false }, isSingleton: false },
  );
}

export default function ConfirmarRedefinicaoPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createConfirmClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createConfirmClient();

  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError =
      params.get("error_description") ?? params.get("error_code") ?? params.get("error");

    if (urlError) {
      setError(decodeURIComponent(urlError));
      setLinkInvalid(true);
      return;
    }

    const hash = params.get("token_hash");
    if (!hash) {
      setError("O link não trouxe o código de verificação.");
      setLinkInvalid(true);
      return;
    }

    setTokenHash(hash);
  }, []);

  async function handleConfirm() {
    if (!tokenHash) return;
    setSubmitting(true);
    setError(null);

    const supabase = supabaseRef.current!;
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (verifyError) {
      setSubmitting(false);
      setError(verifyError.message);
      setLinkInvalid(true);
      return;
    }

    // Sessão de recuperação estabelecida — /redefinir-senha detecta a
    // sessão existente via getSession e mostra o formulário.
    router.push("/redefinir-senha");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">
            Redefinir sua senha
          </CardTitle>
          <CardDescription>
            {linkInvalid
              ? "Não foi possível validar o link."
              : "Confirme abaixo para escolher uma nova senha."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {linkInvalid ? (
            <>
              <p className="text-sm text-destructive">
                Esse link de redefinição é inválido ou expirou. Peça um novo.
              </p>
              {error ? (
                <p className="text-xs text-muted-foreground">
                  Detalhe técnico: {error}
                </p>
              ) : null}
              <a
                href="/esqueci-senha"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Pedir novo link
              </a>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!tokenHash || submitting}
              >
                {submitting ? "Verificando..." : "Confirmar redefinição de senha"}
              </Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
