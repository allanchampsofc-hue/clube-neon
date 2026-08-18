-- ============================================================================
-- Clube Neon — Feature 6: Pesquisa de Satisfação Pós-Visita
-- ============================================================================

alter table system_config add column survey_enabled boolean not null default true;
alter table system_config add column survey_message text not null default
  'Olá, {nome}! Como foi sua visita à Neon hoje? 🍕
Responda com um número:
1 - Muito ruim
2 - Ruim
3 - Regular
4 - Bom
5 - Excelente
Sua opinião é muito importante pra gente! 💚';

-- ----------------------------------------------------------------------------
-- satisfaction_surveys: unique(credit_transaction_id) garante 1 pesquisa por
-- utilização (a elegibilidade de "1 por dia" é decidida na criação, olhando
-- customer_id + data, não aqui). answered_message_id não está na lista
-- original do pedido, mas é necessário pra idempotência de verdade do
-- webhook (o whatsapp_message_id já guarda o id da mensagem que NÓS
-- mandamos — a pergunta —, então precisa de um campo separado pro id da
-- mensagem de RESPOSTA do cliente, senão não dá pra deduplicar reentregas
-- do webhook da Z-API).
-- ----------------------------------------------------------------------------

create table satisfaction_surveys (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  credit_transaction_id uuid not null unique references credit_transactions (id) on delete restrict,
  score integer check (score >= 1 and score <= 5),
  sent_at timestamptz,
  answered_at timestamptz,
  whatsapp_message_id text,
  answered_message_id text unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'ANSWERED', 'FAILED')),
  created_at timestamptz not null default now()
);

create index satisfaction_surveys_customer_id_idx on satisfaction_surveys (customer_id);
create index satisfaction_surveys_status_idx on satisfaction_surveys (status);
create index satisfaction_surveys_created_at_idx on satisfaction_surveys (created_at desc);

alter table satisfaction_surveys enable row level security;

create policy "Staff le satisfaction_surveys" on satisfaction_surveys
  for select to authenticated using (is_staff());

-- ----------------------------------------------------------------------------
-- create_survey_if_eligible: chamada pela Server Action de utilização, logo
-- depois de record_credit_transaction. "1 pesquisa por dia por cliente" é
-- checado por customer_id + data de criação (qualquer status conta, não só
-- enviada) — evita empilhar pesquisa nova a cada utilização do mesmo dia.
-- ----------------------------------------------------------------------------

create or replace function create_survey_if_eligible(p_credit_transaction_id uuid)
returns satisfaction_surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx credit_transactions%rowtype;
  v_customer customers%rowtype;
  v_survey_enabled boolean;
  v_already_today boolean;
  v_survey satisfaction_surveys%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  select * into v_tx from credit_transactions where id = p_credit_transaction_id;
  if not found then
    raise exception 'Transação de crédito % não encontrada', p_credit_transaction_id;
  end if;

  select * into v_customer from customers where id = v_tx.customer_id;

  select survey_enabled into v_survey_enabled from system_config limit 1;
  if not v_survey_enabled then
    return null;
  end if;

  if v_customer.phone is null or btrim(v_customer.phone) = '' then
    return null;
  end if;

  select exists (
    select 1 from satisfaction_surveys
    where customer_id = v_tx.customer_id
      and created_at::date = current_date
  ) into v_already_today;

  if v_already_today then
    return null;
  end if;

  insert into satisfaction_surveys (customer_id, credit_transaction_id, status)
  values (v_tx.customer_id, p_credit_transaction_id, 'PENDING')
  returning * into v_survey;

  return v_survey;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_pending_surveys_to_send: usada pelo cron. "Delay de 30 minutos" =
-- created_at do PENDING tem que ter pelo menos 30min.
-- ----------------------------------------------------------------------------

create or replace function get_pending_surveys_to_send()
returns table (id uuid, customer_id uuid, customer_name text, phone text)
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
  select s.id, s.customer_id, c.name, c.phone
  from satisfaction_surveys s
  join customers c on c.id = s.customer_id
  where s.status = 'PENDING'
    and s.created_at <= now() - interval '30 minutes';
end;
$$;

-- ----------------------------------------------------------------------------
-- mark_survey_sent / mark_survey_failed: transição de status feita pelo
-- cron depois de tentar enviar via Z-API.
-- ----------------------------------------------------------------------------

create or replace function mark_survey_sent(p_survey_id uuid, p_whatsapp_message_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  update satisfaction_surveys
  set status = 'SENT', sent_at = now(), whatsapp_message_id = p_whatsapp_message_id
  where id = p_survey_id;
end;
$$;

create or replace function mark_survey_failed(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  update satisfaction_surveys
  set status = 'FAILED'
  where id = p_survey_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- record_survey_answer: chamada pelo webhook da Z-API (service_role, sem
-- sessão de usuário). Casa o telefone normalizando dos dois lados (cadastro
-- pode ou não ter o "55" na frente) e só atualiza pesquisa SENT nas
-- últimas 24h — resposta fora da janela ou sem pesquisa correspondente
-- não faz nada. Idempotente via answered_message_id (unique): reentrega do
-- mesmo webhook não processa a resposta de novo.
-- ----------------------------------------------------------------------------

create or replace function record_survey_answer(
  p_phone text,
  p_score integer,
  p_message_id text
)
returns satisfaction_surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_survey satisfaction_surveys%rowtype;
begin
  if not (auth.role() = 'service_role' or is_staff()) then
    raise exception 'Acesso negado.';
  end if;

  if exists (select 1 from satisfaction_surveys where answered_message_id = p_message_id) then
    return null;
  end if;

  select id into v_customer_id
  from customers
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p_phone
     or ('55' || regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = p_phone
  limit 1;

  if v_customer_id is null then
    return null;
  end if;

  update satisfaction_surveys
  set score = p_score,
      status = 'ANSWERED',
      answered_at = now(),
      answered_message_id = p_message_id
  where customer_id = v_customer_id
    and status = 'SENT'
    and sent_at >= now() - interval '24 hours'
  returning * into v_survey;

  if v_survey.id is not null then
    insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
    values (
      null,
      'SURVEY_ANSWERED',
      'satisfaction_survey',
      v_survey.id,
      null,
      jsonb_build_object('score', p_score)
    );
  end if;

  return v_survey;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_dashboard_metrics: adiciona satisfacao_media (nota média dos últimos
-- 30 dias, null se não houver nenhuma resposta ainda). Muda o tipo de
-- retorno, então precisa dropar antes.
-- ----------------------------------------------------------------------------

drop function if exists get_dashboard_metrics();

create function get_dashboard_metrics()
returns table (
  assinantes_ativos bigint,
  novos_assinantes_mes bigint,
  canceladas_mes bigint,
  inadimplentes bigint,
  receita_recorrente_cents bigint,
  credito_liberado_mes_cents bigint,
  credito_utilizado_mes_cents bigint,
  indicacoes_mes bigint,
  membros_ouro bigint,
  membros_black bigint,
  satisfacao_media numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Acesso negado: apenas a equipe pode ver as métricas do painel.';
  end if;

  return query
  select
    (select count(*) from subscriptions where status = 'ATIVA'),
    (select count(*) from subscriptions where started_at >= date_trunc('month', now())),
    (select count(*) from subscriptions where status = 'CANCELADA' and cancel_at >= date_trunc('month', now())),
    (select count(*) from subscriptions where status = 'INADIMPLENTE'),
    (select coalesce(sum(p.price_cents), 0)
       from subscriptions s join plans p on p.id = s.plan_id
       where s.status = 'ATIVA'),
    (select coalesce(sum(amount_cents), 0) from credit_transactions
       where type = 'CREDITO_MENSAL' and created_at >= date_trunc('month', now())),
    (select coalesce(sum(-amount_cents), 0) from credit_transactions
       where type = 'UTILIZACAO' and created_at >= date_trunc('month', now())),
    (select count(*) from referrals where created_at >= date_trunc('month', now())),
    (select count(*) from customers where membership_level = 'OURO'),
    (select count(*) from customers where membership_level = 'BLACK'),
    (select round(avg(score), 1) from satisfaction_surveys
       where score is not null and created_at >= now() - interval '30 days');
end;
$$;
