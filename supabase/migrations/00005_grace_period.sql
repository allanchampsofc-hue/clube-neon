-- ============================================================================
-- Clube Neon — grace period do fim de contrato (ETAPA 09)
--
-- Redefine process_subscription_cycle_rollover (00004) com 3 ramos:
--   1. Ciclo atual é grace period e já terminou -> expira o saldo
--      remanescente e marca a assinatura EXPIRADA. Não abre novo ciclo.
--   2. Ciclo atual é o último mês contratado (cycle_number == duration_months)
--      -> em vez de expirar e cobrar de novo, abre um ciclo de carência
--      (is_grace_period = true) de plan.grace_period_months meses. O saldo
--      remanescente NÃO expira e nenhum CREDITO_MENSAL é liberado (o
--      contrato já terminou) — a carteira existente é só reatribuída pro
--      novo ciclo.
--   3. Caso normal (ETAPA 08): expira o saldo do ciclo, abre o próximo e
--      libera o crédito mensal.
-- ============================================================================

create or replace function process_subscription_cycle_rollover(p_subscription_id uuid)
returns subscription_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_plan plans%rowtype;
  v_current_cycle subscription_cycles%rowtype;
  v_current_wallet credit_wallets%rowtype;
  v_wallet_found boolean;
  v_new_cycle_number integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_new_cycle subscription_cycles%rowtype;
  v_new_wallet_id uuid;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  select * into v_subscription
  from subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Assinatura % não encontrada', p_subscription_id;
  end if;

  if v_subscription.status <> 'ATIVA' then
    raise exception 'Só é possível processar o ciclo de assinaturas ATIVA (atual: %)',
      v_subscription.status;
  end if;

  select * into v_plan from plans where id = v_subscription.plan_id;

  select * into v_current_cycle
  from subscription_cycles
  where subscription_id = p_subscription_id
  order by cycle_number desc
  limit 1;

  if not found then
    raise exception 'Assinatura % não tem ciclo aberto', p_subscription_id;
  end if;

  if v_current_cycle.period_end > now() then
    raise exception 'Ciclo atual da assinatura % ainda não terminou (termina em %)',
      p_subscription_id, v_current_cycle.period_end;
  end if;

  select * into v_current_wallet
  from credit_wallets
  where cycle_id = v_current_cycle.id;
  v_wallet_found := found;

  -- Ramo 1: o grace period terminou. Expira o saldo remanescente e encerra.
  if v_current_cycle.is_grace_period then
    if v_wallet_found and v_current_wallet.balance_cents > 0 then
      perform record_credit_transaction(
        v_current_wallet.id,
        'EXPIRACAO',
        -v_current_wallet.balance_cents,
        'Saldo remanescente expirado ao fim do grace period',
        null,
        '{}'::jsonb
      );
    end if;

    update subscriptions
    set status = 'EXPIRADA'
    where id = p_subscription_id;

    return v_current_cycle;
  end if;

  v_new_cycle_number := v_current_cycle.cycle_number + 1;

  -- Ramo 2: fim dos meses contratados -> abre o grace period.
  if v_new_cycle_number > v_plan.duration_months then
    if v_plan.grace_period_months <= 0 then
      -- Sem carência configurada: expira e encerra na hora.
      if v_wallet_found and v_current_wallet.balance_cents > 0 then
        perform record_credit_transaction(
          v_current_wallet.id,
          'EXPIRACAO',
          -v_current_wallet.balance_cents,
          'Saldo remanescente expirado ao fim do contrato (sem carência configurada)',
          null,
          '{}'::jsonb
        );
      end if;

      update subscriptions
      set status = 'EXPIRADA'
      where id = p_subscription_id;

      return v_current_cycle;
    end if;

    v_period_start := v_current_cycle.period_end;
    v_period_end := v_period_start + make_interval(months => v_plan.grace_period_months);

    insert into subscription_cycles (subscription_id, cycle_number, period_start, period_end, is_grace_period)
    values (p_subscription_id, v_new_cycle_number, v_period_start, v_period_end, true)
    returning * into v_new_cycle;

    if v_wallet_found then
      update credit_wallets
      set cycle_id = v_new_cycle.id
      where id = v_current_wallet.id;
    else
      -- Não deveria acontecer (todo ciclo ATIVA tem carteira), mas evita
      -- deixar o cliente sem carteira nenhuma durante a carência.
      insert into credit_wallets (cycle_id, customer_id, balance_cents)
      values (v_new_cycle.id, v_subscription.customer_id, 0);
    end if;

    update subscriptions
    set current_period_end = v_period_end
    where id = p_subscription_id;

    return v_new_cycle;
  end if;

  -- Ramo 3: rollover mensal normal (ETAPA 08).
  if v_wallet_found and v_current_wallet.balance_cents > 0 then
    perform record_credit_transaction(
      v_current_wallet.id,
      'EXPIRACAO',
      -v_current_wallet.balance_cents,
      'Saldo não utilizado expirado ao fim do ciclo ' || v_current_cycle.cycle_number,
      null,
      '{}'::jsonb
    );
  end if;

  v_period_start := v_current_cycle.period_end;
  v_period_end := v_period_start + interval '1 month';

  insert into subscription_cycles (subscription_id, cycle_number, period_start, period_end, is_grace_period)
  values (p_subscription_id, v_new_cycle_number, v_period_start, v_period_end, false)
  returning * into v_new_cycle;

  insert into credit_wallets (cycle_id, customer_id, balance_cents)
  values (v_new_cycle.id, v_subscription.customer_id, 0)
  returning id into v_new_wallet_id;

  perform record_credit_transaction(
    v_new_wallet_id,
    'CREDITO_MENSAL',
    v_plan.monthly_credit_cents,
    'Crédito mensal liberado no início do ciclo ' || v_new_cycle_number,
    null,
    '{}'::jsonb
  );

  update subscriptions
  set current_period_end = v_period_end
  where id = p_subscription_id;

  return v_new_cycle;
end;
$$;
