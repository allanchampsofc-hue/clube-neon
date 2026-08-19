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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Client próprio desta página, com detectSessionInUrl desligado — a
// detecção automática (ligada por padrão) processa a URL sozinha ao
// instanciar o client, competindo com as chamadas manuais abaixo
// (exchangeCodeForSession/refreshSession) pelo consumo do mesmo código
// ou refresh_token de uso único. Aqui tudo é tratado explicitamente:
// ?code= (fluxo PKCE, usado pelo e-mail de verdade do Supabase) ou
// #access_token=/#refresh_token= (fluxo antigo, usado por links gerados
// manualmente via admin.generateLink).
function createRecoveryClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false }, isSingleton: false },
  );
}

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createRecoveryClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createRecoveryClient();
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = supabaseRef.current!;

    // O e-mail de verdade que o Supabase manda usa fluxo PKCE — o link
    // aponta pro /auth/v1/verify do Supabase, que redireciona pra cá com
    // ?code=... na query string (não #access_token= no hash). O
    // code_verifier correspondente foi salvo em cookie pelo Server Action
    // de /esqueci-senha (mesmo client com cookie storage), então só
    // funciona se o link for aberto no MESMO navegador que pediu a
    // redefinição.
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const urlError = searchParams.get("error_description") ?? searchParams.get("error_code") ?? searchParams.get("error");

    if (urlError) {
      // O Supabase já rejeitou o link antes mesmo de chegar aqui (token
      // expirado/já usado) — o redirect vem com esses parâmetros de erro
      // em vez de ?code=.
      setDebugMessage(decodeURIComponent(urlError));
      setLinkInvalid(true);
      return;
    }

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeError }) => {
          if (exchangeError) {
            console.error("exchangeCodeForSession falhou:", exchangeError);
            setDebugMessage(exchangeError.message);
            setLinkInvalid(true);
          } else {
            window.history.replaceState(null, "", window.location.pathname);
            setReady(true);
          }
        })
        .catch((e: unknown) => {
          console.error("exchangeCodeForSession lançou exceção:", e);
          setDebugMessage(e instanceof Error ? e.message : String(e));
          setLinkInvalid(true);
        });
      return;
    }

    // Fallback: links gerados manualmente (ex: admin.generateLink) usam o
    // formato antigo, com os tokens direto no fragmento hash.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (accessToken && refreshToken && type === "recovery") {
      // refreshSession sempre bate em POST /auth/v1/token?grant_type=
      // refresh_token — caminho mais direto que setSession (que só faz
      // isso quando o access_token já está expirado; senão valida via
      // GET /auth/v1/user, um passo a mais sem necessidade aqui).
      supabase.auth
        .refreshSession({ refresh_token: refreshToken })
        .then(({ error: sessionError }) => {
          if (sessionError) {
            console.error("refreshSession falhou:", sessionError);
            setDebugMessage(sessionError.message);
            setLinkInvalid(true);
          } else {
            // Limpa o hash da URL (contém tokens sensíveis) sem recarregar.
            window.history.replaceState(null, "", window.location.pathname);
            setReady(true);
          }
        })
        .catch((e: unknown) => {
          console.error("refreshSession lançou exceção:", e);
          setDebugMessage(e instanceof Error ? e.message : String(e));
          setLinkInvalid(true);
        });
      return;
    }

    if (!accessToken) {
      setDebugMessage("Nenhum código (?code=) nem token (#access_token=) encontrado no link.");
    } else {
      setDebugMessage(`Hash presente mas incompleto: type=${type}, tem access_token=${!!accessToken}, tem refresh_token=${!!refreshToken}`);
    }

    // Sem hash de recuperação — confirma se já existe sessão válida antes
    // de desistir (ex: usuário atualizou a página depois de já validada).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        setLinkInvalid(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    const supabase = supabaseRef.current!;
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">
            Definir nova senha
          </CardTitle>
          <CardDescription>
            {ready
              ? "Escolha sua nova senha de acesso ao Clube Neon."
              : linkInvalid
                ? "Não foi possível validar o link."
                : "Verificando o link..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <p className="text-sm text-primary">
              Senha atualizada! Redirecionando pro login...
            </p>
          ) : linkInvalid ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-destructive">
                Esse link de redefinição é inválido ou expirou. Peça um novo.
              </p>
              {debugMessage ? (
                <p className="text-xs text-muted-foreground">
                  Detalhe técnico: {debugMessage}
                </p>
              ) : null}
              <a
                href="/esqueci-senha"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Pedir novo link
              </a>
            </div>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">Um instante...</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="mt-2" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
