-- ============================================================================
-- Clube Neon — Feature 1: Indicação de Amigos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- system_config: linha única com parâmetros de negócio configuráveis pelo
-- SUPER_ADMIN em /painel/sistema — mesmo padrão já usado em `plans` (uma
-- linha, uma coluna por parâmetro). Cresce por migration a cada feature nova
-- que precisar de um valor configurável, em vez de hardcode no código.
-- Leitura pública porque o valor do crédito de indicação aparece na landing
-- page pra visitante anônimo (?ref=CODIGO), igual o preço do plano já é.
-- ----------------------------------------------------------------------------

create table system_config (
  id uuid primary key default gen_random_uuid(),
  referral_credit_cents integer not null default 3000 check (referral_credit_cents >= 0),
  updated_at timestamptz not null default now()
);

insert into system_config default values;

create trigger system_config_touch_updated_at
  before update on system_config
  for each row execute function touch_updated_at();

alter table system_config enable row level security;

create policy "Publico le system_config" on system_config
  for select to anon, authenticated using (true);
create policy "Super admins gerenciam system_config" on system_config
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- ----------------------------------------------------------------------------
-- customers.referral_code: código único gerado automaticamente no cadastro
-- (trigger, não no aplicativo — garante unicidade sem corrida entre
-- cadastros concorrentes). Formato NEON-XXXX, 4 caracteres alfanuméricos.
-- security definer porque o trigger roda durante o INSERT de autocadastro
-- (cliente anônimo criando a própria linha) e precisa checar unicidade
-- contra a tabela inteira, que a RLS de "Cliente le proprio registro" não
-- deixaria o próprio cliente enxergar.
-- ----------------------------------------------------------------------------

alter table customers add column referral_code text unique;

create or replace function assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_exists boolean;
begin
  if new.referral_code is not null then
    return new;
  end if;

  loop
    v_code := 'NEON-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    select exists(select 1 from customers where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;

  new.referral_code := v_code;
  return new;
end;
$$;

create trigger customers_assign_referral_code
  before insert on customers
  for each row execute function assign_referral_code();

-- Backfill pra clientes já existentes, que ficariam com referral_code nulo
-- (a coluna foi adicionada depois — o trigger só roda em INSERT novo).
do $$
declare
  v_customer record;
  v_code text;
  v_exists boolean;
begin
  for v_customer in select id from customers where referral_code is null loop
    loop
      v_code := 'NEON-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
      select exists(select 1 from customers where referral_code = v_code) into v_exists;
      exit when not v_exists;
    end loop;
    update customers set referral_code = v_code where id = v_customer.id;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- referrals: uma linha por indicado (unique em referred_customer_id garante
-- "cada indicado só pode usar um código de indicação" — na vida inteira,
-- não só por ciclo). referrer pode ter quantas linhas quiser.
-- ----------------------------------------------------------------------------

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references customers (id) on delete restrict,
  referred_customer_id uuid not null unique references customers (id) on delete restrict,
  referral_code text not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CREDITADO', 'CANCELADO')),
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_customer_id <> referred_customer_id)
);

create index referrals_referrer_customer_id_idx on referrals (referrer_customer_id);
create index referrals_status_idx on referrals (status);
create index referrals_created_at_idx on referrals (created_at desc);

alter table referrals enable row level security;

create policy "Staff gerencia referrals" on referrals
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Cliente le proprias indicacoes" on referrals
  for select to authenticated using (
    referrer_customer_id = current_customer_id() or referred_customer_id = current_customer_id()
  );
create policy "Cliente cria propria indicacao no cadastro" on referrals
  for insert to authenticated with check (referred_customer_id = current_customer_id());

-- ----------------------------------------------------------------------------
-- lookup_referrer_by_code: resolve um código de indicação pro customer_id
-- do indicador. Chamado tanto por visitante anônimo (landing page valida o
-- ?ref=CODIGO antes de mostrar a mensagem) quanto pelo checkout já
-- autenticado (pra criar o referral) — nenhum dos dois teria permissão de
-- ler a linha de outro customer via RLS normal ("Cliente le proprio
-- registro"), por isso security definer. Só devolve o id, nada mais.
-- ----------------------------------------------------------------------------

create or replace function lookup_referrer_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers where referral_code = p_code and active = true;
$$;

-- ----------------------------------------------------------------------------
-- activate_subscription: mesma lógica de sempre, mais o crédito de
-- indicação. Se existir um referral PENDENTE pro customer_id que está
-- ativando agora, credita BONUS pros dois lados (indicado, na carteira que
-- acabou de ser criada; indicador, na carteira ATIVA atual dele) e marca o
-- referral como CREDITADO. Se o indicador não tiver assinatura ATIVA no
-- momento (cancelou/ficou inadimplente desde que indicou), credita só o
-- indicado e registra em audit_logs — não é regra coberta explicitamente no
-- pedido, escolha pragmática pra não travar a ativação do indicado por
-- causa do indicador.
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
  v_referral referrals%rowtype;
  v_referral_credit_cents integer;
  v_referrer_wallet_id uuid;
  v_referred_name text;
  v_referrer_name text;
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

  -- Crédito de indicação: só dispara se houver um referral PENDENTE pra
  -- este customer_id como indicado.
  select * into v_referral
  from referrals
  where referred_customer_id = v_subscription.customer_id
    and status = 'PENDENTE'
  for update;

  if found then
    select referral_credit_cents into v_referral_credit_cents from system_config limit 1;
    select name into v_referred_name from customers where id = v_referral.referred_customer_id;
    select name into v_referrer_name from customers where id = v_referral.referrer_customer_id;

    perform record_credit_transaction(
      v_wallet_id,
      'BONUS',
      v_referral_credit_cents,
      'Bônus de boas-vindas: indicado por ' || coalesce(v_referrer_name, 'um amigo Neon'),
      auth.uid(),
      jsonb_build_object('referral_id', v_referral.id)
    );

    select cw.id into v_referrer_wallet_id
    from credit_wallets cw
    join subscription_cycles sc on sc.id = cw.cycle_id
    join subscriptions s on s.id = sc.subscription_id
    where s.customer_id = v_referral.referrer_customer_id
      and s.status = 'ATIVA'
    order by sc.cycle_number desc
    limit 1;

    if v_referrer_wallet_id is not null then
      perform record_credit_transaction(
        v_referrer_wallet_id,
        'BONUS',
        v_referral_credit_cents,
        'Indicação de amigo: ' || coalesce(v_referred_name, 'novo membro'),
        auth.uid(),
        jsonb_build_object('referral_id', v_referral.id)
      );
    else
      insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
      values (
        auth.uid(),
        'REFERRAL_CREDITED',
        'referral',
        v_referral.id,
        jsonb_build_object('note', 'indicador sem assinatura ativa — só o indicado foi creditado'),
        jsonb_build_object('referrer_customer_id', v_referral.referrer_customer_id)
      );
    end if;

    update referrals
    set status = 'CREDITADO', credited_at = now()
    where id = v_referral.id;

    insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
    values (
      auth.uid(),
      'REFERRAL_CREDITED',
      'referral',
      v_referral.id,
      jsonb_build_object('status', 'PENDENTE'),
      jsonb_build_object('status', 'CREDITADO', 'credit_cents', v_referral_credit_cents)
    );
  end if;

  return v_subscription;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_dashboard_metrics: adiciona indicacoes_mes. Muda o tipo de retorno,
-- então precisa dropar antes — create or replace não permite mudar colunas
-- de saída.
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
  indicacoes_mes bigint
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
    (select count(*) from referrals where created_at >= date_trunc('month', now()));
end;
$$;
