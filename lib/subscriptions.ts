export type SubscriptionStatus =
  | "PENDENTE"
  | "ATIVA"
  | "INADIMPLENTE"
  | "CANCELADA"
  | "EXPIRADA"
  | "SUSPENSA";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDENTE: "Pendente",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
  SUSPENSA: "Suspensa",
};

export const SUBSCRIPTION_STATUS_BADGE_VARIANT: Record<
  SubscriptionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDENTE: "secondary",
  ATIVA: "default",
  INADIMPLENTE: "destructive",
  CANCELADA: "outline",
  EXPIRADA: "outline",
  SUSPENSA: "outline",
};
