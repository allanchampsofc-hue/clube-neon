/** Espelha a mesma conta feita em create_cashback_if_eligible no banco — usada aqui só pra preview em tempo real na tela do operador. A fonte de verdade é a RPC. */
export function calculateCashback(
  extraSpentCents: number,
  percentage: number,
  maxCents: number,
): number {
  if (extraSpentCents <= 0 || percentage <= 0) return 0;
  return Math.min(Math.round((extraSpentCents * percentage) / 100), maxCents);
}
