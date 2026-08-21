-- ----------------------------------------------------------------------------
-- Duas notificações automáticas via WhatsApp que fecham o ciclo de
-- comunicação: crédito liberado a cada rollover mensal, e aviso de fim de
-- plano 30 dias antes do término dos 12 meses.
--
-- Desvio do pedido original: o envio de WhatsApp não pode acontecer "dentro"
-- de process_subscription_cycle_rollover — é uma função PL/pgSQL, sem acesso
-- a HTTP/rede (o projeto não usa pg_net em nenhum outro lugar). O envio
-- acontece no mesmo lugar onde toda notificação por WhatsApp já acontece
-- neste projeto: a rota de cron em TypeScript, logo depois de chamar a RPC —
-- mesmo padrão já usado pra aniversário e subida de nível de membership.
-- A RPC de rollover já retorna a linha do novo ciclo (cycle_number,
-- period_end, is_grace_period), que é exatamente o que a rota precisa pra
-- decidir se notifica — não precisou mudar a RPC de rollover em nada.
-- ----------------------------------------------------------------------------

alter table subscriptions
  add column plan_ending_notified_at timestamptz;

alter table system_config
  add column notify_credit_released boolean not null default true,
  add column notify_plan_ending boolean not null default true,
  add column credit_released_message text not null default
    'Novo mês, novo crédito, {nome}. 🍕
R$ 99,00 disponíveis para usar na Neon até {data_fim_ciclo}.
Lembrando: o crédito é válido só neste mês — não passa para o seguinte.',
  add column plan_ending_message text not null default
    'Oi, {nome}. Seu plano anual no Clube Neon termina em {data_fim}.
Você ainda tem {meses_restantes} mês(es) de crédito pela frente.
Quando chegar a hora, a renovação é por sua conta — não renovamos automaticamente. Qualquer dúvida, é só falar com a gente. 🍕';

-- ----------------------------------------------------------------------------
-- get_subscriptions_needing_plan_ending_notice: assinaturas ATIVA, no
-- penúltimo mês do contrato (mês 11 de 12, calculado a partir de
-- plans.duration_months pra não hardcodar), sem cancelamento agendado e
-- ainda não avisadas. Mesmo padrão de get_todays_birthdays (00015).
-- ----------------------------------------------------------------------------
create or replace function get_subscriptions_needing_plan_ending_notice()
returns table (
  subscription_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  cycle_number integer,
  months_remaining integer,
  plan_end_date timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    s.id,
    c.id,
    c.name,
    c.phone,
    sc.cycle_number,
    p.duration_months - sc.cycle_number + 1,
    s.started_at + (p.duration_months || ' months')::interval
  from subscriptions s
  join customers c on c.id = s.customer_id
  join plans p on p.id = s.plan_id
  join subscription_cycles sc on sc.subscription_id = s.id
  where s.status = 'ATIVA'
    and s.cancellation_requested_at is null
    and s.plan_ending_notified_at is null
    and sc.is_grace_period = false
    and sc.cycle_number = p.duration_months - 1
    and sc.id = (
      select id from subscription_cycles
      where subscription_id = s.id
      order by cycle_number desc
      limit 1
    );
end;
$$;
