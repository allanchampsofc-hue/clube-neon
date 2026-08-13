export type CreditTransactionType =
  | "CREDITO_MENSAL"
  | "UTILIZACAO"
  | "AJUSTE_MANUAL"
  | "ESTORNO"
  | "BONUS"
  | "EXPIRACAO"
  | "CANCELAMENTO";

export const CREDIT_TRANSACTION_TYPE_LABELS: Record<CreditTransactionType, string> = {
  CREDITO_MENSAL: "Crédito mensal",
  UTILIZACAO: "Utilização",
  AJUSTE_MANUAL: "Ajuste manual",
  ESTORNO: "Estorno",
  BONUS: "Bônus",
  EXPIRACAO: "Expiração",
  CANCELAMENTO: "Cancelamento",
};
