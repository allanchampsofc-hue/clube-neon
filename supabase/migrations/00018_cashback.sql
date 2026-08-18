-- ============================================================================
-- Clube Neon — Feature 5: Cashback nas Compras Extras
-- ============================================================================

alter table system_config add column cashback_percentage integer not null default 5
  check (cashback_percentage >= 0 and cashback_percentage <= 100);
alter table system_config add column cashback_max_cents integer not null default 1500
  check (cashback_max_cents >= 0);
alter table system_config add column cashback_enabled boolean not null default true;

-- ----------------------------------------------------------------------------
-- cashback_transactions: gerado quando o pedido excede o crédito usado (o
-- excedente é pago fora do clube). unique em credit_transaction_id garante
-- no máximo 1 cashback por utilização (idempotência). Ledger de verdade
-- continua sendo credit_transactions — isto aqui é só a "promessa" de
-- crédito futuro até o rollover do próximo ciclo confirmar como BONUS.
-- ----------------------------------------------------------------------------

create table cashback_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  cycle_id uuid not null references subscription_cycles (id) on delete restrict,
  credit_transaction_id uuid not null unique references credit_transactions (id) on delete restrict,
  extra_spent_cents integer not null check (extra_spent_cents > 0),
  cashback_cents integer not null check (cashback_cents > 0),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CREDITADO', 'CANCELADO')),
  credited_at timestamptz,
  created_at timestamptz not null default now()
);

create index cashback_transactions_customer_id_idx on cashback_transactions (customer_id);
create index cashback_transactions_cycle_id_idx on cashback_transactions (cycle_id);
create index cashback_transactions_status_idx on cashback_transactions (status);

alter table cashback_transactions enable row level security;

create policy "Staff le cashback_transactions" on cashback_transactions
  for select to authenticated using (is_staff());
create policy "Cliente le proprio cashback" on cashback_transactions
  for select to authenticated using (customer_id = current_customer_id());

-- ----------------------------------------------------------------------------
-- create_cashback_if_eligible: chamada pela Server Action de utilização
-- logo depois de record_credit_transaction (precisa do id da transação
-- UTILIZACAO recém-criada). Reavalia elegibilidade inteiramente no banco —
-- nunca confia no cálculo feito no cliente, que é só preview visual.
-- Retorna null (não uma exceção) quando não é elegível, pra não travar o
-- fluxo de utilização por causa do cashback: cashback é um bônus, nunca
-- deveria impedir a operação principal.
-- ----------------------------------------------------------------------------

create or replace function create_cashback_if_eligible(
  p_credit_transaction_id uuid,
  p_extra_spent_cents integer
)
returns cashback_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx credit_transactions%rowtype;
  v_config record;
  v_has_pending_referral boolean;
  v_cashback_cents integer;
  v_cashback cashback_transactions%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe pode registrar cashback.';
  end if;

  if p_extra_spent_cents <= 0 then
    return null;
  end if;

  select * into v_tx from credit_transactions where id = p_credit_transaction_id;
  if not found then
    raise exception 'Transação de crédito % não encontrada', p_credit_transaction_id;
  end if;

  if v_tx.cycle_id is null then
    return null;
  end if;

  select cashback_enabled, cashback_percentage, cashback_max_cents
  into v_config
  from system_config
  limit 1;

  if not v_config.cashback_enabled or v_config.cashback_percentage <= 0 then
    return null;
  end if;

  -- Indicação pendente (Feature 1) e cashback são os dois tipos de bônus
  -- promocional hoje — só um por ciclo, cliente pode ser indicador ou
  -- indicado.
  select exists (
    select 1 from referrals
    where (referrer_customer_id = v_tx.customer_id or referred_customer_id = v_tx.customer_id)
      and status = 'PENDENTE'
  ) into v_has_pending_referral;

  if v_has_pending_referral then
    return null;
  end if;

  v_cashback_cents := least(
    round(p_extra_spent_cents * v_config.cashback_percentage / 100.0)::integer,
    v_config.cashback_max_cents
  );

  if v_cashback_cents <= 0 then
    return null;
  end if;

  insert into cashback_transactions (
    customer_id, cycle_id, credit_transaction_id, extra_spent_cents, cashback_cents
  )
  values (
    v_tx.customer_id, v_tx.cycle_id, p_credit_transaction_id, p_extra_spent_cents, v_cashback_cents
  )
  returning * into v_cashback;

  return v_cashback;
end;
$$;

-- ----------------------------------------------------------------------------
-- process_subscription_cycle_rollover: mesma lógica de sempre (00005), mais
-- o crédito do cashback PENDENTE do ciclo que está terminando, só no ramo 3
-- (rollover mensal normal — mesmo lugar onde o CREDITO_MENSAL é liberado).
-- Ramos 1/2 (fim de grace period, início de grace period) não liberam
-- CREDITO_MENSAL nenhum, então também não creditam cashback — segue a
-- mesma regra ("junto com o rollover do crédito mensal").
-- ----------------------------------------------------------------------------

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
  v_cashback cashback_transactions%rowtype;
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
      insert into credit_wallets (cycle_id, customer_id, balance_cents)
      values (v_new_cycle.id, v_subscription.customer_id, 0);
    end if;

    update subscriptions
    set current_period_end = v_period_end
    where id = p_subscription_id;

    return v_new_cycle;
  end if;

  -- Ramo 3: rollover mensal normal.
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

  for v_cashback in
    select * from cashback_transactions
    where cycle_id = v_current_cycle.id and status = 'PENDENTE'
  loop
    perform record_credit_transaction(
      v_new_wallet_id,
      'BONUS',
      v_cashback.cashback_cents,
      'Cashback de compra extra no ciclo ' || v_current_cycle.cycle_number,
      null,
      jsonb_build_object('cashback_transaction_id', v_cashback.id)
    );

    update cashback_transactions
    set status = 'CREDITADO', credited_at = now()
    where id = v_cashback.id;

    insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
    values (
      null,
      'CASHBACK_CREDITED',
      'cashback_transaction',
      v_cashback.id,
      jsonb_build_object('status', 'PENDENTE'),
      jsonb_build_object('status', 'CREDITADO', 'cashback_cents', v_cashback.cashback_cents)
    );
  end loop;

  update subscriptions
  set current_period_end = v_period_end
  where id = p_subscription_id;

  return v_new_cycle;
end;
$$;
