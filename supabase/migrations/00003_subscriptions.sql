-- ============================================================================
-- Clube Neon — assinaturas: ativação atômica (ETAPA 06)
-- ============================================================================

-- Ativa uma assinatura PENDENTE e cria seu primeiro ciclo (subscription_cycles)
-- numa transação só, pra nunca deixar a assinatura ATIVA sem um ciclo
-- correspondente (a carteira de crédito da ETAPA 07 depende desse ciclo existir).
create or replace function activate_subscription(p_subscription_id uuid)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_period_start timestamptz := now();
  v_period_end timestamptz := now() + interval '1 month';
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

  update subscriptions
  set status = 'ATIVA',
      started_at = v_period_start,
      current_period_end = v_period_end
  where id = p_subscription_id
  returning * into v_subscription;

  insert into subscription_cycles (subscription_id, cycle_number, period_start, period_end, is_grace_period)
  values (p_subscription_id, 1, v_period_start, v_period_end, false);

  return v_subscription;
end;
$$;
