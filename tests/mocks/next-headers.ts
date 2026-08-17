// Mock de next/headers pros testes de integração. Server Actions usam
// cookies() (@supabase/ssr guarda a sessão em cookies) e headers() — nenhum
// dos dois funciona fora do request scope real do Next. Isso substitui só a
// camada do framework por um cookie-jar em memória; o Supabase em si nunca é
// mockado, é o client real batendo no projeto real.

type Cookie = { name: string; value: string };

let store = new Map<string, string>();

/** Chame no beforeEach/afterEach pra não vazar sessão entre testes. */
export function __resetCookies() {
  store = new Map();
}

export async function cookies() {
  return {
    getAll(): Cookie[] {
      return Array.from(store.entries()).map(([name, value]) => ({ name, value }));
    },
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}

export async function headers() {
  return {
    get(_key: string): string | null {
      return null;
    },
  };
}
