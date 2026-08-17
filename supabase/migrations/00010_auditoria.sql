-- ============================================================================
-- Clube Neon — auditoria (ETAPA 17)
--
-- Reverte a policy de insert direto em audit_logs criada na ETAPA 14: a
-- instrução agora é explícita — cliente nunca insere direto em audit_logs,
-- só via RPC (que decide o user_id sozinha via auth.uid(), então ninguém
-- consegue forjar log em nome de outra pessoa). O modal de ajuste avançado
-- (ETAPA 14) passa a logar através de record_credit_transaction, que já é
-- o único caminho de escrita do ledger — cobre operador, admin e o futuro
-- webhook do Stripe automaticamente, sem duplicar a chamada em cada Server
-- Action.
--
-- Também aperta a leitura: só ADMIN/SUPER_ADMIN veem auditoria agora (era
-- is_staff() antes, ficou amplo demais pra dados sensíveis).
-- ============================================================================

drop policy if exists "Admins inserem audit_logs" on audit_logs;

drop policy if exists "Staff le audit_logs" on audit_logs;
create policy "Admins leem audit_logs" on audit_logs
  for select to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- Log de eventos de identidade (LOGIN/LOGOUT/ADMIN_LOGIN/CHECKOUT) — qualquer
-- usuário autenticado pode logar isso sobre si mesmo (auth.uid() sempre, o
-- chamador nunca escolhe o user_id). entity/entity_id ficam fixos em 'auth'/
-- auth.uid() — não dá pra usar isso pra logar nada sobre outro registro.
-- ----------------------------------------------------------------------------

create or replace function log_auth_event(p_action text)
returns audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log audit_logs%rowtype;
begin
  if p_action not in ('LOGIN', 'LOGOUT', 'ADMIN_LOGIN', 'CHECKOUT') then
    raise exception 'Ação de auditoria inválida: %', p_action;
  end if;

  insert into audit_logs (user_id, action, entity, entity_id)
  values (auth.uid(), p_action, 'auth', auth.uid())
  returning * into v_log;

  return v_log;
end;
$$;

-- ----------------------------------------------------------------------------
-- Log de eventos administrativos (CUSTOMER_*, SUBSCRIPTION_*, USER_ROLE_CHANGED).
-- Permitido pra staff/service_role, OU pro próprio dono do registro (cobre o
-- autocadastro no checkout: o cliente recém-criado loga CUSTOMER_CREATED e
-- SUBSCRIPTION_CREATED sobre o próprio registro, verificado por ownership —
-- nunca sobre o registro de outra pessoa).
-- ----------------------------------------------------------------------------

create or replace function log_audit_event(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_ip_address inet default null
)
returns audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log audit_logs%rowtype;
  v_owns_entity boolean := false;
begin
  if p_entity = 'customer' and p_entity_id is not null then
    v_owns_entity := exists (
      select 1 from customers where id = p_entity_id and user_id = auth.uid()
    );
  elsif p_entity = 'subscription' and p_entity_id is not null then
    v_owns_entity := exists (
      select 1 from subscriptions s
      join customers c on c.id = s.customer_id
      where s.id = p_entity_id and c.user_id = auth.uid()
    );
  end if;

  if not (is_staff() or auth.role() = 'service_role' or v_owns_entity) then
    raise exception 'Acesso negado.';
  end if;

  insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state, ip_address)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_before_state, p_after_state, p_ip_address)
  returning * into v_log;

  return v_log;
end;
$$;

-- ----------------------------------------------------------------------------
-- record_credit_transaction: mesma lógica de sempre, só acrescenta o log de
-- auditoria (CREDIT_USED/CREDIT_ADJUSTED/CREDIT_EXPIRED) direto aqui dentro
-- — é o único caminho de escrita do ledger, então instrumentar aqui cobre
-- operador (UTILIZACAO), admin (AJUSTE_MANUAL/BONUS/ESTORNO) e o cron de
-- rollover (EXPIRACAO) de uma vez só. CREDITO_MENSAL não vira audit_log:
-- já é o próprio ledger que documenta a liberação de rotina.
-- ----------------------------------------------------------------------------

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
  v_audit_action text;
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

  v_audit_action := case p_type
    when 'UTILIZACAO' then 'CREDIT_USED'
    when 'AJUSTE_MANUAL' then 'CREDIT_ADJUSTED'
    when 'BONUS' then 'CREDIT_ADJUSTED'
    when 'ESTORNO' then 'CREDIT_ADJUSTED'
    when 'EXPIRACAO' then 'CREDIT_EXPIRED'
    else null
  end;

  if v_audit_action is not null then
    insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
    values (
      coalesce(p_operator_id, auth.uid()),
      v_audit_action,
      'credit_transaction',
      v_transaction.id,
      jsonb_build_object('balance_cents', v_wallet.balance_cents),
      jsonb_build_object(
        'balance_cents', v_balance_after,
        'type', p_type,
        'amount_cents', p_amount_cents,
        'reason', p_reason
      )
    );
  end if;

  return v_transaction;
end;
$$;

-- ----------------------------------------------------------------------------
-- activate_subscription: mesma lógica, mais log SUBSCRIPTION_ACTIVATED.
-- Fix real de bug encontrado ao mexer aqui: o guard só aceitava is_staff(),
-- então o webhook do Stripe (service_role, sem auth.uid()) NUNCA teria
-- conseguido ativar assinatura nenhuma quando a ETAPA 12 chamar essa RPC de
-- verdade — sempre ia cair em "Acesso negado". Corrigido pro mesmo padrão
-- já usado em record_credit_transaction e process_subscription_cycle_rollover.
-- ----------------------------------------------------------------------------

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
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe ou processos do sistema podem ativar assinaturas.';
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

  insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
  values (
    auth.uid(),
    'SUBSCRIPTION_ACTIVATED',
    'subscription',
    p_subscription_id,
    jsonb_build_object('status', 'PENDENTE'),
    jsonb_build_object('status', 'ATIVA', 'started_at', v_period_start, 'current_period_end', v_period_end)
  );

  return v_subscription;
end;
$$;
