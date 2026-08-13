-- ============================================================================
-- Clube Neon — stripe_customer_id em customers (ETAPA 11)
-- Faltava na ETAPA 02: precisamos rastrear o cliente no gateway pra
-- reaproveitar (não duplicar) ao criar checkout/assinatura.
-- ============================================================================

alter table customers
  add column stripe_customer_id text unique;
