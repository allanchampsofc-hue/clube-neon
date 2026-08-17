-- ============================================================================
-- Clube Neon — métricas do dashboard administrativo (ETAPA 14)
-- ============================================================================

-- "Crédito liberado/utilizado no mês" vem do ledger real (credit_transactions),
-- não de "ciclos ativos × valor do plano": um ciclo de carência conta como
-- "ativo" mas não libera CREDITO_MENSAL nenhum, então essa aproximação
-- superestimaria o indicador pra quem está em carência.
create or replace function get_dashboard_metrics()
returns table (
  assinantes_ativos bigint,
  novos_assinantes_mes bigint,
  canceladas_mes bigint,
  inadimplentes bigint,
  receita_recorrente_cents bigint,
  credito_liberado_mes_cents bigint,
  credito_utilizado_mes_cents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from subscriptions where status = 'ATIVA'),
    (select count(*) from subscriptions where started_at >= date_trunc('month', now())),
    (select count(*) from subscriptions where status = 'CANCELADA' and cancel_at >= date_trunc('month', now())),
    (select count(*) from subscriptions where status = 'INADIMPLENTE'),
    (select coalesce(sum(p.price_cents), 0)
       from subscriptions s join plans p on p.id = s.plan_id
       where s.status = 'ATIVA'),
    (select coalesce(sum(amount_cents), 0) from credit_transactions
       where type = 'CREDITO_MENSAL' and created_at >= date_trunc('month', now())),
    (select coalesce(sum(-amount_cents), 0) from credit_transactions
       where type = 'UTILIZACAO' and created_at >= date_trunc('month', now()))
  where is_staff();
$$;

-- Faltava desde a ETAPA 02: audit_logs não tinha nenhuma policy de insert
-- pra authenticated (só service_role bypassando RLS). O ajuste avançado de
-- crédito (BONUS/AJUSTE_MANUAL/ESTORNO pelo ADMIN+) grava aqui, pelo client
-- de sessão normal — mesmo padrão do resto do projeto.
create policy "Admins inserem audit_logs" on audit_logs
  for insert to authenticated with check (is_admin());
