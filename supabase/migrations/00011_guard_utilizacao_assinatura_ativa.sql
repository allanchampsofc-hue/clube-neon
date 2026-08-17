-- ----------------------------------------------------------------------------
-- record_credit_transaction: mesma lógica da migration anterior, mais uma
-- checagem específica pro tipo UTILIZACAO — hoje a função só validava a
-- carteira (existe? tem saldo?), nunca o status da assinatura. Isso deixava
-- a regra "só usa crédito com assinatura ativa" garantida só pela tela
-- (app/painel/utilizacao/nova/[customerId]/page.tsx filtra status = ATIVA
-- antes de mostrar o form), o que é contornável chamando a Server Action
-- direto. Os outros tipos (AJUSTE_MANUAL, BONUS, ESTORNO, EXPIRACAO,
-- CREDITO_MENSAL) continuam sem essa checagem de propósito: correções e
-- expiração de rotina legitimamente acontecem em assinaturas não-ATIVA.
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
  v_subscription_status text;
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

  if p_type = 'UTILIZACAO' then
    select s.status into v_subscription_status
    from subscription_cycles sc
    join subscriptions s on s.id = sc.subscription_id
    where sc.id = v_wallet.cycle_id;

    if v_subscription_status is distinct from 'ATIVA' then
      raise exception 'Não é possível utilizar crédito: assinatura não está ativa (status: %)', coalesce(v_subscription_status, 'desconhecido');
    end if;
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
