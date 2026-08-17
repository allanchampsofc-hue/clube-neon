export type PaymentStatus = "PENDENTE" | "PAGO" | "FALHOU" | "REEMBOLSADO";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  FALHOU: "Falhou",
  REEMBOLSADO: "Reembolsado",
};
