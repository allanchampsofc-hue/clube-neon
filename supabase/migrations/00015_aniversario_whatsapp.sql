-- ============================================================================
-- Clube Neon — Feature 3: Aniversário via WhatsApp (Z-API)
-- ============================================================================

alter table system_config add column birthday_message text not null default
  '🎂 Feliz aniversário, {nome}! A Neon tem um presente especial pra você: {mimo}. É só apresentar esta mensagem na sua próxima visita. Com carinho, Clube Neon 🍕';
alter table system_config add column birthday_gift text not null default 'sobremesa gratuita';

-- ----------------------------------------------------------------------------
-- birthday_notifications: unique(customer_id, year) garante "só envia uma
-- vez por ano por cliente". Sem policy de insert/update — só service_role
-- (rota de cron) escreve aqui, igual payment_events.
-- ----------------------------------------------------------------------------

create table birthday_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  year integer not null,
  sent_at timestamptz,
  whatsapp_message_id text,
  status text not null check (status in ('SENT', 'FAILED')),
  created_at timestamptz not null default now(),
  unique (customer_id, year)
);

create index birthday_notifications_customer_id_idx on birthday_notifications (customer_id);

alter table birthday_notifications enable row level security;

create policy "Staff le birthday_notifications" on birthday_notifications
  for select to authenticated using (is_staff());

-- ----------------------------------------------------------------------------
-- get_todays_birthdays: usada pelo cron diário. Compara dia+mês (não o ano,
-- que muda) e exclui quem já foi notificado neste ano civil.
-- ----------------------------------------------------------------------------

create or replace function get_todays_birthdays()
returns table (customer_id uuid, name text, phone text, plan_name text)
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
  select c.id, c.name, c.phone, p.name
  from customers c
  join subscriptions s on s.customer_id = c.id and s.status = 'ATIVA'
  join plans p on p.id = s.plan_id
  where c.birth_date is not null
    and extract(month from c.birth_date) = extract(month from current_date)
    and extract(day from c.birth_date) = extract(day from current_date)
    and not exists (
      select 1 from birthday_notifications bn
      where bn.customer_id = c.id and bn.year = extract(year from current_date)::integer
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- get_birthdays_this_month: usada por /painel/aniversariantes. Traz o status
-- de notificação do ano corrente via left join (null = ainda pendente).
-- ----------------------------------------------------------------------------

create or replace function get_birthdays_this_month()
returns table (
  customer_id uuid,
  name text,
  member_number text,
  birth_date date,
  notification_status text,
  sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Acesso negado: apenas a equipe pode ver aniversariantes.';
  end if;

  return query
  select
    c.id, c.name, c.member_number, c.birth_date,
    bn.status, bn.sent_at
  from customers c
  join subscriptions s on s.customer_id = c.id and s.status = 'ATIVA'
  left join birthday_notifications bn
    on bn.customer_id = c.id and bn.year = extract(year from current_date)::integer
  where c.birth_date is not null
    and extract(month from c.birth_date) = extract(month from current_date)
  order by extract(day from c.birth_date);
end;
$$;
