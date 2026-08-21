-- ----------------------------------------------------------------------------
-- Dois planos comerciais (Essencial/Completo) + vouchers (pizza 2x1
-- bimestral, frete grátis mensal só no Completo).
--
-- Numeração: pedido dizia "00024 ou 00025", mas o projeto já está na 00026
-- (aplicada) — esta é 00027.
--
-- Desvios do pedido original, ambos por necessidade estrutural, não estilo:
-- 1. Não criei uma coluna `monthly_price_cents` nova em `plans` — a coluna
--    `price_cents` já existente em `plans` desde a ETAPA 04 já representa
--    exatamente isso (o valor cobrado por parcela mensal) e já é usada em
--    todo o resto do sistema (relatórios, painel, cobrança). Só adicionei
--    `annual_price_cents`, que de fato não existia.
-- 2. O código do voucher FRETE_GRATIS não pode ser um texto fixo por mês
--    (ex: "FRETE-AGO2026") igual pra todo cliente Completo, porque `code` é
--    `unique` — e mesmo sem o constraint, um código compartilhado tornaria
--    impossível saber QUAL cliente está resgatando ao validar pelo código
--    (o balcão só teria o código, sem saber de quem é). O código gerado
--    mantém o prefixo "FRETE-MÊSANO" (reconhecível) mas com um sufixo
--    numérico único por cliente, ex: "FRETE-AGO2026-4821".
-- ----------------------------------------------------------------------------

alter table plans
  add column plan_type text,
  add column annual_price_cents integer;

update plans
set name = 'Clube Neon Essencial',
    plan_type = 'ESSENCIAL',
    price_cents = 3990,
    monthly_credit_cents = 8000,
    annual_price_cents = 39900
where name = 'Clube Neon';

insert into plans (name, plan_type, price_cents, monthly_credit_cents, annual_price_cents, duration_months, grace_period_months, active)
values ('Clube Neon Completo', 'COMPLETO', 4990, 9900, 49900, 12, 2, true);

alter table plans
  alter column plan_type set not null,
  alter column annual_price_cents set not null,
  add constraint plans_plan_type_check check (plan_type in ('ESSENCIAL', 'COMPLETO'));

-- ----------------------------------------------------------------------------
-- vouchers
-- ----------------------------------------------------------------------------
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  voucher_type text not null check (voucher_type in ('PIZZA_2X1', 'FRETE_GRATIS')),
  code text not null,
  cycle_number integer not null,
  status text not null default 'DISPONIVEL' check (status in ('DISPONIVEL', 'UTILIZADO', 'EXPIRADO')),
  valid_until timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index vouchers_code_idx on vouchers (code);
create index vouchers_customer_status_idx on vouchers (customer_id, status);
create index vouchers_valid_until_idx on vouchers (valid_until) where status = 'DISPONIVEL';
create index vouchers_subscription_type_cycle_idx on vouchers (subscription_id, voucher_type, cycle_number);

alter table vouchers enable row level security;

create policy "Cliente le proprios vouchers" on vouchers
  for select to authenticated using (customer_id = current_customer_id());
create policy "Staff le todos os vouchers" on vouchers
  for select to authenticated using (is_staff());
-- Sem policy de insert/update: só as RPCs abaixo (security definer) escrevem.

-- ----------------------------------------------------------------------------
-- generate_bimonthly_voucher: chamada pelo cron logo após o rollover mensal.
-- Idempotente (não gera duplicado pro mesmo cycle_number) e silenciosa em
-- mês ímpar (retorna null, não é erro).
-- ----------------------------------------------------------------------------
create or replace function generate_bimonthly_voucher(p_subscription_id uuid)
returns vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_cycle subscription_cycles%rowtype;
  v_code text;
  v_attempt integer := 0;
  v_voucher vouchers%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: apenas processos do sistema podem gerar vouchers.';
  end if;

  select * into v_subscription from subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Assinatura % não encontrada', p_subscription_id;
  end if;

  select * into v_cycle
  from subscription_cycles
  where subscription_id = p_subscription_id
  order by cycle_number desc
  limit 1;
  if not found then
    raise exception 'Assinatura % não tem ciclo', p_subscription_id;
  end if;

  if v_cycle.cycle_number % 2 <> 0 then
    return null;
  end if;

  if exists (
    select 1 from vouchers
    where subscription_id = p_subscription_id
      and voucher_type = 'PIZZA_2X1'
      and cycle_number = v_cycle.cycle_number
  ) then
    return null;
  end if;

  loop
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_attempt := v_attempt + 1;
    exit when not exists (select 1 from vouchers where code = v_code and status = 'DISPONIVEL');
    if v_attempt >= 10 then
      raise exception 'Não foi possível gerar um código único no momento.';
    end if;
  end loop;

  insert into vouchers (subscription_id, customer_id, voucher_type, code, cycle_number, valid_until)
  values (p_subscription_id, v_subscription.customer_id, 'PIZZA_2X1', v_code, v_cycle.cycle_number, now() + interval '30 days')
  returning * into v_voucher;

  insert into audit_logs (action, entity, entity_id, after_state)
  values ('VOUCHER_GENERATED', 'voucher', v_voucher.id,
    jsonb_build_object('voucher_type', 'PIZZA_2X1', 'cycle_number', v_cycle.cycle_number));

  return v_voucher;
end;
$$;

-- ----------------------------------------------------------------------------
-- generate_monthly_frete: só pra plano COMPLETO, todo mês (chamada pelo cron
-- junto com a de cima). Também idempotente por cycle_number.
-- ----------------------------------------------------------------------------
create or replace function generate_monthly_frete(p_subscription_id uuid)
returns vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_plan plans%rowtype;
  v_cycle subscription_cycles%rowtype;
  v_code text;
  v_attempt integer := 0;
  v_month_labels text[] := array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  v_prefix text;
  v_voucher vouchers%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: apenas processos do sistema podem gerar vouchers.';
  end if;

  select * into v_subscription from subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Assinatura % não encontrada', p_subscription_id;
  end if;

  select * into v_plan from plans where id = v_subscription.plan_id;
  if v_plan.plan_type <> 'COMPLETO' then
    return null;
  end if;

  select * into v_cycle
  from subscription_cycles
  where subscription_id = p_subscription_id
  order by cycle_number desc
  limit 1;
  if not found then
    raise exception 'Assinatura % não tem ciclo', p_subscription_id;
  end if;

  if exists (
    select 1 from vouchers
    where subscription_id = p_subscription_id
      and voucher_type = 'FRETE_GRATIS'
      and cycle_number = v_cycle.cycle_number
  ) then
    return null;
  end if;

  v_prefix := 'FRETE-' || v_month_labels[extract(month from now())::int] || extract(year from now())::text;

  loop
    v_code := v_prefix || '-' || lpad(floor(random() * 10000)::text, 4, '0');
    v_attempt := v_attempt + 1;
    exit when not exists (select 1 from vouchers where code = v_code);
    if v_attempt >= 10 then
      raise exception 'Não foi possível gerar um código único no momento.';
    end if;
  end loop;

  insert into vouchers (subscription_id, customer_id, voucher_type, code, cycle_number, valid_until)
  values (
    p_subscription_id, v_subscription.customer_id, 'FRETE_GRATIS', v_code, v_cycle.cycle_number,
    (date_trunc('month', now()) + interval '1 month' - interval '1 day' + interval '23:59:59')
  )
  returning * into v_voucher;

  insert into audit_logs (action, entity, entity_id, after_state)
  values ('VOUCHER_GENERATED', 'voucher', v_voucher.id,
    jsonb_build_object('voucher_type', 'FRETE_GRATIS', 'cycle_number', v_cycle.cycle_number));

  return v_voucher;
end;
$$;

-- ----------------------------------------------------------------------------
-- redeem_voucher: chamada pela tela /garcom (sem sessão Supabase — mesmo
-- padrão de confirm_by_code, protegido por PIN + rate limit na API, não RLS).
-- ----------------------------------------------------------------------------
create or replace function redeem_voucher(p_code text, p_operator_id uuid)
returns vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher vouchers%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  select * into v_voucher from vouchers where code = p_code for update;
  if not found then
    raise exception 'Voucher não encontrado.';
  end if;

  if v_voucher.status = 'UTILIZADO' then
    raise exception 'Este voucher já foi utilizado.';
  end if;

  if v_voucher.status = 'EXPIRADO' or v_voucher.valid_until < now() then
    update vouchers set status = 'EXPIRADO' where id = v_voucher.id;
    raise exception 'Este voucher expirou.';
  end if;

  update vouchers
  set status = 'UTILIZADO', used_at = now(), used_by = p_operator_id
  where id = v_voucher.id
  returning * into v_voucher;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (p_operator_id, 'VOUCHER_REDEEMED', 'voucher', v_voucher.id,
    jsonb_build_object('voucher_type', v_voucher.voucher_type));

  return v_voucher;
end;
$$;

-- ----------------------------------------------------------------------------
-- expire_old_vouchers: cron diário.
-- ----------------------------------------------------------------------------
create or replace function expire_old_vouchers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: apenas processos do sistema podem expirar vouchers.';
  end if;

  update vouchers
  set status = 'EXPIRADO'
  where status = 'DISPONIVEL'
    and valid_until < now();

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into audit_logs (action, entity, after_state)
    values ('VOUCHERS_EXPIRED', 'voucher', jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;
