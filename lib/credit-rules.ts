/**
 * Regras puras de débito de crédito — sem banco, sem rede. A garantia REAL
 * (saldo nunca fica negativo) é imposta pela RPC record_credit_transaction
 * no banco, que não pode ser contornada; isso aqui é a mesma regra em JS,
 * pra validar na tela antes de bater no servidor e pra ficar testável sem
 * depender de conexão nenhuma.
 */

export type DebitValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validateDebit(balanceCents: number, amountCents: number): DebitValidation {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { valid: false, reason: "O valor precisa ser maior que zero." };
  }
  if (amountCents > balanceCents) {
    return { valid: false, reason: "Saldo insuficiente." };
  }
  return { valid: true };
}

/** Aplica o débito e retorna o novo saldo. Lança se a regra acima não passar. */
export function applyDebit(balanceCents: number, amountCents: number): number {
  const validation = validateDebit(balanceCents, amountCents);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  return balanceCents - amountCents;
}
