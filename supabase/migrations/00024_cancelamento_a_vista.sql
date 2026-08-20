-- ----------------------------------------------------------------------------
-- Cancelamento à vista não tem multa nem antecipa nada: quem já pagou os 12
-- meses de uma vez só está registrando a intenção de não renovar. O crédito
-- mensal continua normalmente até o fim natural do contrato (já tratado pela
-- lógica existente de carência/expiração — não precisa duplicar isso aqui).
--
-- Sem coluna nova: só troca o comportamento de request_subscription_cancellation
-- pra não preencher cancellation_effective_at quando payment_type = 'ANNUAL'.
-- process_scheduled_cancellations() já ignora linhas com effective_at nulo,
-- então não precisou de nenhuma outra mudança.
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
  v_effective_at timestamptz;
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

  if v_subscription.payment_type = 'ANNUAL' then
    -- Já pago — sem multa, sem cobrança futura pra cancelar. Só registra a
    -- intenção; o contrato segue até o fim natural dos 12 meses.
    v_effective_at := null;
  else
    v_effective_at := now() + (v_subscription.cancellation_penalty_months || ' months')::interval;
  end if;

  update subscriptions
  set cancellation_requested_at = now(),
      cancellation_effective_at = v_effective_at,
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
      'payment_type', v_subscription.payment_type,
      'cancellation_effective_at', v_subscription.cancellation_effective_at,
      'reason', p_reason
    )
  );

  return v_subscription;
end;
$$;
