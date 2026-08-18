-- ============================================================================
-- Clube Neon — Feature 2: Sorteio Mensal Automático
-- ============================================================================

alter table system_config add column next_draw_prize text not null default 'Jantar especial para 2';

-- ----------------------------------------------------------------------------
-- monthly_draws: uma linha por mês (unique em month), month no formato
-- YYYY-MM. winner_customer_id fica null se nenhum assinante era elegível
-- (não impede o registro do "mês sem sorteio" — evita reprocessar o mesmo
-- mês pela idempotência).
-- ----------------------------------------------------------------------------

create table monthly_draws (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,
  winner_customer_id uuid references customers (id) on delete set null,
  prize_description text not null,
  notified_at timestamptz,
  drawn_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index monthly_draws_winner_customer_id_idx on monthly_draws (winner_customer_id);

alter table monthly_draws enable row level security;

create policy "Staff gerencia monthly_draws" on monthly_draws
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Cliente le proprio sorteio ganho" on monthly_draws
  for select to authenticated using (winner_customer_id = current_customer_id());

-- ----------------------------------------------------------------------------
-- run_monthly_draw: sorteia 1 assinante ATIVA há pelo menos 30 dias,
-- excluindo quem ganhou no mês anterior. Idempotente por mês (unique em
-- month barra reexecução, tanto pelo cron quanto pelo botão manual). Não
-- manda WhatsApp — isso é responsabilidade do caller em TypeScript, já que
-- Postgres não faz chamada HTTP direta aqui.
-- ----------------------------------------------------------------------------

create or replace function run_monthly_draw(p_prize_description text default null)
returns monthly_draws
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_prev_month text := to_char(now() - interval '1 month', 'YYYY-MM');
  v_prev_winner uuid;
  v_winner_id uuid;
  v_prize text;
  v_draw monthly_draws%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe ou processos do sistema podem rodar o sorteio.';
  end if;

  if exists (select 1 from monthly_draws where month = v_month) then
    raise exception 'Já existe um sorteio registrado para %.', v_month;
  end if;

  select winner_customer_id into v_prev_winner
  from monthly_draws
  where month = v_prev_month;

  select s.customer_id into v_winner_id
  from subscriptions s
  where s.status = 'ATIVA'
    and s.started_at <= now() - interval '30 days'
    and (v_prev_winner is null or s.customer_id <> v_prev_winner)
  order by random()
  limit 1;

  if v_winner_id is null then
    raise exception 'Nenhum assinante elegível pro sorteio de %.', v_month;
  end if;

  select coalesce(p_prize_description, next_draw_prize) into v_prize
  from system_config
  limit 1;

  insert into monthly_draws (month, winner_customer_id, prize_description, drawn_by)
  values (v_month, v_winner_id, v_prize, auth.uid())
  returning * into v_draw;

  insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
  values (
    auth.uid(),
    'DRAW_EXECUTED',
    'monthly_draw',
    v_draw.id,
    null,
    jsonb_build_object('month', v_month, 'winner_customer_id', v_winner_id, 'prize', v_prize)
  );

  return v_draw;
end;
$$;
