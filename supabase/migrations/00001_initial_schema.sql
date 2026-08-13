-- ============================================================================
-- Clube Neon — schema inicial (ETAPA 02)
-- Tabelas, RLS, funções helper e RPC atômica de crédito.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Utilitário: trigger genérica de updated_at
-- ----------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- RBAC — roles / user_roles
-- ============================================================================

create table roles (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

insert into roles (code, label) values
  ('SUPER_ADMIN', 'Super administrador'),
  ('ADMIN', 'Administrador'),
  ('GERENTE', 'Gerente'),
  ('OPERADOR', 'Operador'),
  ('CLIENTE', 'Cliente');

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_code text not null references roles (code) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, role_code)
);

create index user_roles_user_id_idx on user_roles (user_id);

-- ============================================================================
-- customers
-- ============================================================================

create sequence customers_member_number_seq;

create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  cpf text not null unique,
  birth_date date,
  member_number text not null unique
    default ('CN-' || lpad(nextval('customers_member_number_seq')::text, 6, '0')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_cpf_idx on customers (cpf);
create index customers_member_number_idx on customers (member_number);
create index customers_user_id_idx on customers (user_id);

-- ============================================================================
-- Funções helper de RLS (security definer — leem tabelas que o próprio
-- usuário autenticado não teria permissão de ler diretamente)
-- ============================================================================

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles
    where user_id = auth.uid()
      and role_code in ('OPERADOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN')
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles
    where user_id = auth.uid()
      and role_code in ('ADMIN', 'SUPER_ADMIN')
  );
$$;

create or replace function current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers where user_id = auth.uid();
$$;

create trigger customers_touch_updated_at
  before update on customers
  for each row execute function touch_updated_at();

-- Cliente ganha a role CLIENTE automaticamente ao ter login vinculado.
create or replace function assign_cliente_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into user_roles (user_id, role_code)
    values (new.user_id, 'CLIENTE')
    on conflict (user_id, role_code) do nothing;
  end if;
  return new;
end;
$$;

create trigger customers_assign_cliente_role
  after insert or update of user_id on customers
  for each row execute function assign_cliente_role();

-- ============================================================================
-- plans (plano configurável — não hardcoded)
-- ============================================================================

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  monthly_credit_cents integer not null check (monthly_credit_cents >= 0),
  duration_months integer not null check (duration_months > 0),
  grace_period_months integer not null default 2 check (grace_period_months >= 0),
  stripe_price_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_touch_updated_at
  before update on plans
  for each row execute function touch_updated_at();

-- ============================================================================
-- subscriptions
-- ============================================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  plan_id uuid not null references plans (id) on delete restrict,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'ATIVA', 'INADIMPLENTE', 'CANCELADA', 'EXPIRADA', 'SUSPENSA')),
  started_at timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_customer_id_idx on subscriptions (customer_id);
create index subscriptions_status_idx on subscriptions (status);

create trigger subscriptions_touch_updated_at
  before update on subscriptions
  for each row execute function touch_updated_at();

-- ============================================================================
-- subscription_cycles
-- ============================================================================

create table subscription_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  is_grace_period boolean not null default false,
  created_at timestamptz not null default now(),
  unique (subscription_id, cycle_number)
);

create index subscription_cycles_subscription_id_idx on subscription_cycles (subscription_id);

-- ============================================================================
-- credit_wallets (uma carteira por ciclo)
-- ============================================================================

create table credit_wallets (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references subscription_cycles (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete restrict,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_wallets_customer_id_idx on credit_wallets (customer_id);

create trigger credit_wallets_touch_updated_at
  before update on credit_wallets
  for each row execute function touch_updated_at();

-- ============================================================================
-- credit_transactions (ledger append-only — nunca apagar/alterar)
-- ============================================================================

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  subscription_id uuid references subscriptions (id) on delete set null,
  cycle_id uuid references subscription_cycles (id) on delete set null,
  wallet_id uuid references credit_wallets (id) on delete set null,
  type text not null check (type in (
    'CREDITO_MENSAL', 'UTILIZACAO', 'AJUSTE_MANUAL', 'ESTORNO', 'BONUS', 'EXPIRACAO', 'CANCELAMENTO'
  )),
  -- Convenção de sinal: positivo aumenta o saldo (CREDITO_MENSAL, BONUS, ESTORNO),
  -- negativo diminui (UTILIZACAO, EXPIRACAO, CANCELAMENTO). AJUSTE_MANUAL pode ser
  -- qualquer sinal, conforme o caso.
  amount_cents integer not null,
  balance_before_cents integer not null check (balance_before_cents >= 0),
  balance_after_cents integer not null check (balance_after_cents >= 0),
  reason text,
  operator_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credit_transactions_balance_consistency
    check (balance_after_cents = balance_before_cents + amount_cents)
);

create index credit_transactions_customer_id_created_at_idx
  on credit_transactions (customer_id, created_at desc);
create index credit_transactions_subscription_id_idx on credit_transactions (subscription_id);
create index credit_transactions_wallet_id_idx on credit_transactions (wallet_id);

-- ============================================================================
-- RPC atômica — único caminho permitido para escrever no ledger.
-- Lê o saldo atual da carteira, calcula before/after e grava os dois em
-- transação única, evitando corrida entre leituras concorrentes de saldo.
-- ============================================================================

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
  -- security definer bypassa RLS: sem essa checagem, qualquer usuário
  -- autenticado (inclusive CLIENTE) poderia chamar essa RPC diretamente
  -- e manipular o próprio saldo. Uso de crédito é sempre mediado por staff.
  if not is_staff() then
    raise exception 'Acesso negado: apenas a equipe pode registrar transações de crédito.';
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

-- ============================================================================
-- benefit_configs / benefit_redemptions
-- Schema propositalmente genérico — o handoff não detalha benefícios além do
-- crédito; "rules" carrega a configuração específica de cada tipo de benefício.
-- ============================================================================

create table benefit_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  plan_id uuid references plans (id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger benefit_configs_touch_updated_at
  before update on benefit_configs
  for each row execute function touch_updated_at();

create table benefit_redemptions (
  id uuid primary key default gen_random_uuid(),
  benefit_config_id uuid not null references benefit_configs (id) on delete restrict,
  customer_id uuid not null references customers (id) on delete restrict,
  subscription_id uuid references subscriptions (id) on delete set null,
  operator_id uuid references auth.users (id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  redeemed_at timestamptz not null default now()
);

create index benefit_redemptions_customer_id_idx on benefit_redemptions (customer_id);

-- ============================================================================
-- payments / payment_events
-- ============================================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'PAGO', 'FALHOU', 'REEMBOLSADO')),
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_subscription_id_idx on payments (subscription_id);

create trigger payments_touch_updated_at
  before update on payments
  for each row execute function touch_updated_at();

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- audit_logs
-- ============================================================================

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_entity_id_idx on audit_logs (entity, entity_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table roles enable row level security;
alter table user_roles enable row level security;
alter table customers enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table subscription_cycles enable row level security;
alter table credit_wallets enable row level security;
alter table credit_transactions enable row level security;
alter table benefit_configs enable row level security;
alter table benefit_redemptions enable row level security;
alter table payments enable row level security;
alter table payment_events enable row level security;
alter table audit_logs enable row level security;

-- roles: leitura liberada para autenticados, escrita só admin
create policy "Autenticados leem roles" on roles
  for select to authenticated using (true);
create policy "Admins gerenciam roles" on roles
  for all to authenticated using (is_admin()) with check (is_admin());

-- user_roles: staff lê tudo, usuário lê o próprio, só admin escreve
create policy "Staff le user_roles" on user_roles
  for select to authenticated using (is_staff());
create policy "Usuario le suas proprias roles" on user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "Admins gerenciam user_roles" on user_roles
  for all to authenticated using (is_admin()) with check (is_admin());

-- customers: staff lê/gerencia tudo, cliente lê o próprio; delete sempre negado
-- (exclusão é sempre soft via active=false, nunca hard delete)
create policy "Staff le customers" on customers
  for select to authenticated using (is_staff());
create policy "Cliente le proprio registro" on customers
  for select to authenticated using (user_id = auth.uid());
create policy "Staff insere customers" on customers
  for insert to authenticated with check (is_staff());
create policy "Staff atualiza customers" on customers
  for update to authenticated using (is_staff()) with check (is_staff());

-- plans: leitura pública dos planos ativos (landing page), escrita só admin
create policy "Publico le planos ativos" on plans
  for select to anon, authenticated using (active = true or is_admin());
create policy "Admins gerenciam planos" on plans
  for all to authenticated using (is_admin()) with check (is_admin());

-- subscriptions: staff lê/gerencia tudo, cliente lê a própria
create policy "Staff le subscriptions" on subscriptions
  for select to authenticated using (is_staff());
create policy "Cliente le proprias subscriptions" on subscriptions
  for select to authenticated using (customer_id = current_customer_id());
create policy "Staff gerencia subscriptions" on subscriptions
  for all to authenticated using (is_staff()) with check (is_staff());

-- subscription_cycles: mesmo padrão de subscriptions
create policy "Staff le subscription_cycles" on subscription_cycles
  for select to authenticated using (is_staff());
create policy "Cliente le proprios ciclos" on subscription_cycles
  for select to authenticated using (
    subscription_id in (
      select id from subscriptions where customer_id = current_customer_id()
    )
  );
create policy "Staff gerencia subscription_cycles" on subscription_cycles
  for all to authenticated using (is_staff()) with check (is_staff());

-- credit_wallets: staff lê/gerencia tudo, cliente lê a própria
create policy "Staff le credit_wallets" on credit_wallets
  for select to authenticated using (is_staff());
create policy "Cliente le propria carteira" on credit_wallets
  for select to authenticated using (customer_id = current_customer_id());
create policy "Staff gerencia credit_wallets" on credit_wallets
  for all to authenticated using (is_staff()) with check (is_staff());

-- credit_transactions: ledger append-only.
-- Inserção só pela RPC record_credit_transaction (security definer, roda como
-- owner da função — não depende de policy de insert para authenticated).
-- update/delete sempre negados: correções só via novo lançamento (ESTORNO/AJUSTE_MANUAL).
create policy "Staff le credit_transactions" on credit_transactions
  for select to authenticated using (is_staff());
create policy "Cliente le proprio ledger" on credit_transactions
  for select to authenticated using (customer_id = current_customer_id());
create policy "Ledger nunca e atualizado via API" on credit_transactions
  for update to authenticated using (false);
create policy "Ledger nunca e apagado via API" on credit_transactions
  for delete to authenticated using (false);

-- benefit_configs: leitura pública dos ativos, escrita só admin
create policy "Publico le beneficios ativos" on benefit_configs
  for select to anon, authenticated using (active = true or is_admin());
create policy "Admins gerenciam benefit_configs" on benefit_configs
  for all to authenticated using (is_admin()) with check (is_admin());

-- benefit_redemptions: staff lê/gerencia tudo, cliente lê o próprio
create policy "Staff le benefit_redemptions" on benefit_redemptions
  for select to authenticated using (is_staff());
create policy "Cliente le proprias redemptions" on benefit_redemptions
  for select to authenticated using (customer_id = current_customer_id());
create policy "Staff gerencia benefit_redemptions" on benefit_redemptions
  for insert to authenticated with check (is_staff());

-- payments: staff lê/gerencia tudo, cliente lê o próprio
create policy "Staff le payments" on payments
  for select to authenticated using (is_staff());
create policy "Cliente le proprios payments" on payments
  for select to authenticated using (
    subscription_id in (
      select id from subscriptions where customer_id = current_customer_id()
    )
  );
-- Escrita fica só para service_role (webhooks Stripe), que bypassa RLS —
-- nenhuma policy de insert/update para authenticated aqui de propósito.

-- payment_events: nenhuma policy para authenticated/anon — só service_role
-- (webhook handler) via lib/supabase/admin.ts.

-- audit_logs: staff lê, ninguém escreve via API — sempre gravado por service_role
create policy "Staff le audit_logs" on audit_logs
  for select to authenticated using (is_staff());
