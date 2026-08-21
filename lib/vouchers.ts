export type VoucherType = "PIZZA_2X1" | "FRETE_GRATIS";
export type VoucherStatus = "DISPONIVEL" | "UTILIZADO" | "EXPIRADO";
export type PlanType = "ESSENCIAL" | "COMPLETO";

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  PIZZA_2X1: "🍕 Pizza 2x1",
  FRETE_GRATIS: "🛵 Frete grátis",
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  DISPONIVEL: "Disponível",
  UTILIZADO: "Utilizado",
  EXPIRADO: "Expirado",
};

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  ESSENCIAL: "Essencial",
  COMPLETO: "Completo",
};

export const PIZZA_2X1_RULES =
  "Na compra de uma pizza de 8 fatias, você ganha outra de igual ou menor sabor. Válido para consumo no salão da Neon Pizzaria. Não é cumulativo com outras promoções, descontos ou benefícios. Válido por 30 dias a partir da liberação. Um voucher por visita. Sujeito à disponibilidade do cardápio vigente.";

export const FRETE_GRATIS_RULES =
  "Frete grátis para entregas em Taubaté. Válido para um pedido por mês. Não é cumulativo com outras promoções ou descontos. Válido até o último dia do mês de emissão. Exclusivo para membros do Clube Neon Completo.";
