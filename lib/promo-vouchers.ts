export type PromoVoucherStatus = "DISPONIVEL" | "UTILIZADO" | "EXPIRADO" | "CANCELADO";
export type PromoVoucherPaymentMethod = "PIX" | "DINHEIRO" | "CARTAO";

export const PROMO_VOUCHER_STATUS_LABELS: Record<PromoVoucherStatus, string> = {
  DISPONIVEL: "Disponível",
  UTILIZADO: "Utilizado",
  EXPIRADO: "Expirado",
  CANCELADO: "Cancelado",
};

export const PROMO_VOUCHER_PAYMENT_LABELS: Record<PromoVoucherPaymentMethod, string> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  CARTAO: "Cartão",
};
