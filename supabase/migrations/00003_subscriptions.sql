-- ============================================================================
-- Clube Neon — assinaturas: ativação atômica (ETAPA 06)
-- Estendida na ETAPA 07: a ativação agora também cria a carteira de crédito
-- do primeiro ciclo e libera o CREDITO_MENSAL do plano, tudo na mesma
-- transação — "crédito só é liberado após pagamento confirmado" (handoff),
-- e hoje a ativação manual pelo staff é o nosso ponto de confirmação
-- (até a integração real com Stripe nas ETAPAs 11/12).
-- ============================================================================

-- Ativa uma assinatura PENDENTE: cria o primeiro ciclo (subscription_cycles),
-- a carteira de crédito (credit_wallets) desse ciclo e libera o crédito
-- mensal do plano (credit_transactions, via record_credit_transaction) —
-- tudo numa transação só, pra nunca deixar a assinatura ATIVA sem carteira
-- e crédito correspondentes.
create or replace function activate_subscription(p_subscription_id uuid)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_plan plans%rowtype;
  v_period_start timestamptz := now();
  v_period_end timestamptz := now() + interval '1 month';
  v_cycle_id uuid;
  v_wallet_id uuid;
begin
  if not is_staff() then
    raise exception 'Acesso negado: apenas a equipe pode ativar assinaturas.';
  end if;

  select * into v_subscription
  from subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Assinatura % não encontrada', p_subscription_id;
  end if;

  if v_subscription.status <> 'PENDENTE' then
    raise exception 'Só é possível ativar assinaturas com status PENDENTE (atual: %)',
      v_subscription.status;
  end if;

  select * into v_plan from plans where id = v_subscription.plan_id;

  if not found then
    raise exception 'Plano % não encontrado', v_subscription.plan_id;
  end if;

  update subscriptions
  set status = 'ATIVA',
      started_at = v_period_start,
      current_period_end = v_period_end
  where id = p_subscription_id
  returning * into v_subscription;

  insert into subscription_cycles (subscription_id, cycle_number, period_start, period_end, is_grace_period)
  values (p_subscription_id, 1, v_period_start, v_period_end, false)
  returning id into v_cycle_id;

  insert into credit_wallets (cycle_id, customer_id, balance_cents)
  values (v_cycle_id, v_subscription.customer_id, 0)
  returning id into v_wallet_id;

  perform record_credit_transaction(
    v_wallet_id,
    'CREDITO_MENSAL',
    v_plan.monthly_credit_cents,
    'Crédito mensal liberado na ativação da assinatura',
    auth.uid(),
    '{}'::jsonb
  );

  return v_subscription;
end;
$$;
