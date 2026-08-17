export type CreditPeriod = "atual" | "3m" | "6m";

export const CREDIT_PERIOD_LABELS: Record<CreditPeriod, string> = {
  atual: "Mês atual",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
};

/** Início do período, calculado em JS — a agregação em si acontece no banco. */
export function creditPeriodStart(period: CreditPeriod): Date {
  const now = new Date();
  if (period === "atual") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const months = period === "3m" ? 3 : 6;
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  return start;
}

export function formatMonthLabel(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
