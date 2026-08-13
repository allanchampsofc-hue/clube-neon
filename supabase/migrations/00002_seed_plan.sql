-- ============================================================================
-- Clube Neon — seed do plano único (ETAPA 04)
-- Idempotente: só insere se ainda não existir um plano com esse nome.
-- ============================================================================

insert into plans (name, price_cents, monthly_credit_cents, duration_months, grace_period_months, active)
select 'Clube Neon', 4990, 9900, 12, 2, true
where not exists (select 1 from plans where name = 'Clube Neon');
