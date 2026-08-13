-- ============================================================================
-- Clube Neon — rollover mensal de ciclo (ETAPA 08)
--
-- A partir daqui, mudanças em funções existentes ficam em migrations novas
-- (via create or replace), em vez de emendar arquivos antigos: não temos mais
-- garantia de que nada foi implantado ainda a cada nova etapa.
-- ============================================================================

-- Fix: record_credit_transaction (00001) só permitia is_staff(), mas o
-- rollover automático abaixo roda via cron com a service role key — sem
-- usuário autenticado, auth.uid() é nulo e is_staff() sempre falha. Sem esse
-- ajuste, todo lançamento de crédito feito pelo cron seria rejeitado.
create or replace function record_credit_transaction(
  p_wallet_id uuid,
  p_type text,
  p_amount_cents integer,
  p_reason text default null,
  p_operator_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet credit_wallets%rowtype;
  v_balance_after integer;
  v_transaction credit_transactions%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe ou processos do sistema podem registrar transações de crédito.';
  end if;

  select * into v_wallet
  from credit_wallets
  where id = p_wallet_id
  for update;

  if not found then
    raise exception 'Carteira de crédito % não encontrada', p_wallet_id;
  end if;

  v_balance_after := v_wallet.balance_cents + p_amount_cents;

  if v_balance_after < 0 then
    raise exception 'Saldo insuficiente: saldo atual R$ %, tentativa de variação R$ %',
      v_wallet.balance_cents / 100.0, p_amount_cents / 100.0;
  end if;

  insert into credit_transactions (
    customer_id, subscription_id, cycle_id, wallet_id, type,
    amount_cents, balance_before_cents, balance_after_cents,
    reason, operator_id, metadata
  )
  select
    v_wallet.customer_id, sc.subscription_id, v_wallet.cycle_id, v_wallet.id, p_type,
    p_amount_cents, v_wallet.balance_cents, v_balance_after,
    p_reason, p_operator_id, p_metadata
  from subscription_cycles sc
  where sc.id = v_wallet.cycle_id
  returning * into v_transaction;

  update credit_wallets
  set balance_cents = v_balance_after
  where id = p_wallet_id;

  return v_transaction;
end;
$$;

-- Processa o rollover de UMA assinatura ATIVA cujo ciclo atual já terminou:
-- expira o saldo remanescente do ciclo antigo, abre o próximo ciclo e libera
-- o crédito mensal do plano — tudo atômico. Se o próximo ciclo ultrapassar a
-- duração contratada do plano (ex: mês 13), não avança: a abertura do grace
-- period é a ETAPA 09, ainda não implementada — a assinatura fica com o
-- último ciclo vencido até lá (idempotente: reprocessar não faz mal, só
-- falha de novo com o mesmo erro).
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

  v_new_cycle_number := v_current_cycle.cycle_number + 1;

  if v_new_cycle_number > v_plan.duration_months then
    raise exception 'Assinatura % concluiu os % meses do plano — grace period ainda não implementado (ETAPA 09)',
      p_subscription_id, v_plan.duration_months;
  end if;

  select * into v_current_wallet
  from credit_wallets
  where cycle_id = v_current_cycle.id;

  if found and v_current_wallet.balance_cents > 0 then
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
