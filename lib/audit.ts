export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "ADMIN_LOGIN",
  "CHECKOUT",
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_CANCELLED",
  "CREDIT_USED",
  "CREDIT_ADJUSTED",
  "CREDIT_EXPIRED",
  "USER_ROLE_CHANGED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_BY_STAFF",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  ADMIN_LOGIN: "Login (staff)",
  CHECKOUT: "Checkout",
  CUSTOMER_CREATED: "Cliente criado",
  CUSTOMER_UPDATED: "Cliente atualizado",
  SUBSCRIPTION_CREATED: "Assinatura criada",
  SUBSCRIPTION_ACTIVATED: "Assinatura ativada",
  SUBSCRIPTION_CANCELLED: "Assinatura cancelada",
  CREDIT_USED: "Crédito utilizado",
  CREDIT_ADJUSTED: "Crédito ajustado",
  CREDIT_EXPIRED: "Crédito expirado",
  USER_ROLE_CHANGED: "Perfil de acesso alterado",
  PASSWORD_CHANGED: "Senha alterada pelo próprio cliente",
  PASSWORD_RESET_BY_STAFF: "Senha redefinida pela equipe",
};

export const AUDIT_ENTITIES = [
  "auth",
  "customer",
  "subscription",
  "credit_transaction",
] as const;
