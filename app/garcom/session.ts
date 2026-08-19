export const WAITER_SESSION_KEY = "clube_neon_waiter_pin";
export const WAITER_SESSION_AT_KEY = "clube_neon_waiter_pin_at";
export const INACTIVITY_MS = 30 * 60 * 1000;

/** PIN válido salvo nesta aba, ou null se não existe/passou de 30min sem atividade. */
export function getStoredWaiterPin(): string | null {
  const pin = sessionStorage.getItem(WAITER_SESSION_KEY);
  const at = Number(sessionStorage.getItem(WAITER_SESSION_AT_KEY) ?? 0);
  if (!pin || !at || Date.now() - at > INACTIVITY_MS) {
    clearWaiterSession();
    return null;
  }
  return pin;
}

export function touchWaiterSession(): void {
  sessionStorage.setItem(WAITER_SESSION_AT_KEY, String(Date.now()));
}

export function clearWaiterSession(): void {
  sessionStorage.removeItem(WAITER_SESSION_KEY);
  sessionStorage.removeItem(WAITER_SESSION_AT_KEY);
}
