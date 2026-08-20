-- ----------------------------------------------------------------------------
-- Atualização do modelo comercial: Clube Neon é um plano ANUAL de 12 meses,
-- com duas formas de pagamento (parcelado 12x ou à vista), e cancelamento
-- antecipado com multa de 3 meses em vez de cancelamento imediato.
--
-- payment_type/annual_payment_amount_cents são metadados descritivos —
-- não mudam a lógica de crédito mensal (ambas as opções liberam os mesmos
-- R$99,00/mês por 12 meses via process_subscription_cycle_rollover, que
-- não precisou de nenhuma alteração).
--
-- annual_price_cents/monthly_price_cents em system_config são os preços de
-- MARKETING (landing page, checkout) — deliberadamente separados de
-- plans.price_cents, que é o valor efetivamente cobrado por ciclo mensal
-- (usado pelo rollover/relatórios). Um plano com pagamento à vista não tem
-- "cobrança por ciclo" no sentido do plans.price_cents; por isso os dois
-- preços de exibição vivem em system_config, não em plans.
-- ----------------------------------------------------------------------------

alter table subscriptions
  add column payment_type text not null default 'MONTHLY'
    check (payment_type in ('MONTHLY', 'ANNUAL')),
  add column annual_payment_amount_cents integer,
  add column cancellation_requested_at timestamptz,
  add column cancellation_effective_at timestamptz,
  add column cancellation_penalty_months integer not null default 3,
  add column cancellation_reason text;

alter table system_config
  add column annual_price_cents integer not null default 49900,
  add column monthly_price_cents integer not null default 4990;

-- ----------------------------------------------------------------------------
-- request_subscription_cancellation: pedido do próprio cliente (ou staff em
-- nome dele). Não muda o status agora — a assinatura continua ATIVA, ainda
-- cobrando e ainda liberando/aceitando uso de crédito, pelos próximos
-- `cancellation_penalty_months` meses. Só marca a data efetiva futura;
-- process_scheduled_cancellations() (chamada pelo cron diário) é quem de
-- fato encerra quando a data chega.
-- ----------------------------------------------------------------------------
create or replace function request_subscription_cancellation(
  p_subscription_id uuid,
  p_reason text default null
)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
begin
  select * into v_subscription
  from subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Assinatura não encontrada.';
  end if;

  if not (is_staff() or auth.role() = 'service_role' or v_subscription.customer_id = current_customer_id()) then
    raise exception 'Acesso negado.';
  end if;

  if v_subscription.status <> 'ATIVA' then
    raise exception 'Só é possível pedir cancelamento de uma assinatura ativa (status atual: %)', v_subscription.status;
  end if;

  if v_subscription.cancellation_requested_at is not null then
    raise exception 'Já existe um cancelamento agendado pra esta assinatura.';
  end if;

  update subscriptions
  set cancellation_requested_at = now(),
      cancellation_effective_at = now() + (v_subscription.cancellation_penalty_months || ' months')::interval,
      cancellation_reason = p_reason
  where id = p_subscription_id
  returning * into v_subscription;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (
    auth.uid(),
    'SUBSCRIPTION_CANCELLATION_REQUESTED',
    'subscription',
    p_subscription_id,
    jsonb_build_object(
      'cancellation_effective_at', v_subscription.cancellation_effective_at,
      'reason', p_reason
    )
  );

  return v_subscription;
end;
$$;

-- ----------------------------------------------------------------------------
-- revert_subscription_cancellation: staff desfaz um pedido de cancelamento
-- ainda não efetivado.
-- ----------------------------------------------------------------------------
create or replace function revert_subscription_cancellation(p_subscription_id uuid)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe pode reverter um cancelamento.';
  end if;

  update subscriptions
  set cancellation_requested_at = null,
      cancellation_effective_at = null,
      cancellation_reason = null
  where id = p_subscription_id
    and status = 'ATIVA'
  returning * into v_subscription;

  if not found then
    raise exception 'Assinatura não encontrada ou não está mais ativa.';
  end if;

  insert into audit_logs (user_id, action, entity, entity_id)
  values (auth.uid(), 'SUBSCRIPTION_CANCELLATION_REVERTED', 'subscription', p_subscription_id);

  return v_subscription;
end;
$$;

-- ----------------------------------------------------------------------------
-- process_scheduled_cancellations: chamada pelo cron diário. Encerra de
-- verdade as assinaturas cuja data efetiva de cancelamento já passou.
-- ----------------------------------------------------------------------------
create or replace function process_scheduled_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_ids uuid[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: apenas processos do sistema podem processar cancelamentos agendados.';
  end if;

  select array_agg(id) into v_ids
  from subscriptions
  where status = 'ATIVA'
    and cancellation_effective_at is not null
    and cancellation_effective_at <= now();

  if v_ids is null then
    return 0;
  end if;

  update subscriptions
  set status = 'CANCELADA',
      cancel_at = now()
  where id = any(v_ids);

  get diagnostics v_count = row_count;

  insert into audit_logs (action, entity, entity_id, after_state)
  select 'SUBSCRIPTION_CANCELLED', 'subscription', id,
    jsonb_build_object('reason', 'scheduled_cancellation_effective')
  from unnest(v_ids) as id;

  return v_count;
end;
$$;
