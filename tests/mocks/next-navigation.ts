// Mock de next/navigation — redirect() de verdade lança um erro especial
// (NEXT_REDIRECT) que só o runtime do Next sabe interpretar. Aqui, lança um
// erro com a URL anexada, que os testes capturam pra afirmar contra ela —
// mesmo padrão de controle de fluxo (throw-to-abort) do redirect real.

export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
    this.name = "RedirectSignal";
  }
}

export function redirect(url: string): never {
  throw new RedirectSignal(url);
}

/** Roda a Server Action e retorna a URL do redirect (ou lança se não redirecionou). */
export async function captureRedirect(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RedirectSignal) {
      return error.url;
    }
    throw error;
  }
  throw new Error("Esperava um redirect, mas a ação terminou sem redirecionar.");
}
