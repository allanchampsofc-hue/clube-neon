-- ============================================================================
-- Clube Neon — relatórios (ETAPA 16)
--
-- Todo o cálculo fica no banco (SQL agregado), como pedido — as páginas só
-- chamam essas RPCs e formatam o resultado.
--
-- Nota sobre "retenção" e "MRR por mês": subscriptions guarda só o status
-- ATUAL de cada assinatura, não um histórico de transições. Reconstituo o
-- estado "ativa em tal data" usando os timestamps que temos (started_at,
-- cancel_at pra CANCELADA, updated_at como proxy pra quando virou EXPIRADA,
-- já que não existe expired_at dedicado). É uma aproximação razoável, não
-- um histórico exato — documentado aqui pra não parecer precisão que não
-- existe.
-- ============================================================================

create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and role_code in ('GERENTE', 'ADMIN', 'SUPER_ADMIN')
  );
$$;

-- ----------------------------------------------------------------------------
-- Relatório de assinantes
-- ----------------------------------------------------------------------------

create or replace function get_subscribers_by_status()
returns table(status text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select st.status, count(s.id)
  from unnest(array['PENDENTE','ATIVA','INADIMPLENTE','SUSPENSA','CANCELADA','EXPIRADA']) as st(status)
  left join subscriptions s on s.status = st.status
  where is_manager()
  group by st.status;
$$;

create or replace function get_new_subscribers_by_month(p_months integer default 6)
returns table(month date, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gs.month::date, count(s.id)
  from generate_series(
    date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
    date_trunc('month', now()),
    interval '1 month'
  ) as gs(month)
  left join subscriptions s on date_trunc('month', s.started_at) = gs.month
  where is_manager()
  group by gs.month
  order by gs.month;
$$;

create or replace function get_churn_by_month(p_months integer default 6)
returns table(month date, cancelled bigint, expired bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    gs.month::date,
    count(*) filter (
      where c.status = 'CANCELADA' and date_trunc('month', c.cancel_at) = gs.month
    ),
    count(*) filter (
      where c.status = 'EXPIRADA' and date_trunc('month', c.updated_at) = gs.month
    )
  from generate_series(
    date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
    date_trunc('month', now()),
    interval '1 month'
  ) as gs(month)
  left join subscriptions c
    on (c.status = 'CANCELADA' and date_trunc('month', c.cancel_at) = gs.month)
    or (c.status = 'EXPIRADA' and date_trunc('month', c.updated_at) = gs.month)
  where is_manager()
  group by gs.month
  order by gs.month;
$$;

create or replace function get_retention_by_month(p_months integer default 6)
returns table(month date, active_start bigint, active_end bigint, retention_rate numeric)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select
      gs.month::date as month_start,
      (gs.month + interval '1 month')::date as month_end
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as gs(month)
  ),
  counts as (
    select
      m.month_start,
      (
        select count(*) from subscriptions s
        where s.started_at <= m.month_start
          and not (
            (s.status = 'CANCELADA' and s.cancel_at is not null and s.cancel_at <= m.month_start)
            or (s.status = 'EXPIRADA' and s.updated_at <= m.month_start)
          )
      ) as active_start,
      (
        select count(*) from subscriptions s
        where s.started_at <= m.month_end
          and not (
            (s.status = 'CANCELADA' and s.cancel_at is not null and s.cancel_at <= m.month_end)
            or (s.status = 'EXPIRADA' and s.updated_at <= m.month_end)
          )
      ) as active_end
    from months m
  )
  select
    month_start,
    active_start,
    active_end,
    case when active_start = 0 then null
         else round((active_end::numeric / active_start) * 100, 1)
    end as retention_rate
  from counts
  where is_manager()
  order by month_start;
$$;

-- ----------------------------------------------------------------------------
-- Relatório de créditos
-- ----------------------------------------------------------------------------

create or replace function get_credits_summary(p_start timestamptz)
returns table(liberado_cents bigint, utilizado_cents bigint, expirado_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount_cents) filter (where type = 'CREDITO_MENSAL'), 0),
    coalesce(sum(-amount_cents) filter (where type = 'UTILIZACAO'), 0),
    coalesce(sum(-amount_cents) filter (where type = 'EXPIRACAO'), 0)
  from credit_transactions
  where created_at >= p_start
    and is_manager();
$$;

create or replace function get_top_credit_users(p_start timestamptz, p_limit integer default 10)
returns table(customer_id uuid, customer_name text, member_number text, total_utilizado_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.member_number, sum(-ct.amount_cents) as total_utilizado_cents
  from credit_transactions ct
  join customers c on c.id = ct.customer_id
  where ct.type = 'UTILIZACAO'
    and ct.created_at >= p_start
    and is_manager()
  group by c.id, c.name, c.member_number
  order by total_utilizado_cents desc
  limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Relatório de receita
-- ----------------------------------------------------------------------------

create or replace function get_mrr_by_month(p_months integer default 6)
returns table(month date, mrr_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select
      gs.month::date as month_start,
      (gs.month + interval '1 month')::date as month_end
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as gs(month)
  )
  select
    m.month_start,
    coalesce((
      select sum(p.price_cents)
      from subscriptions s
      join plans p on p.id = s.plan_id
      where s.started_at <= m.month_end
        and not (
          (s.status = 'CANCELADA' and s.cancel_at is not null and s.cancel_at <= m.month_end)
          or (s.status = 'EXPIRADA' and s.updated_at <= m.month_end)
        )
    ), 0)
  from months m
  where is_manager()
  order by m.month_start;
$$;

-- total_cents da linha INADIMPLENTE já é o "valor total em risco" — não
-- precisa de uma RPC separada só pra isso.
create or replace function get_revenue_by_status()
returns table(status text, total_count bigint, total_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select st.status, count(s.id), coalesce(sum(p.price_cents), 0)
  from unnest(array['PENDENTE','ATIVA','INADIMPLENTE','SUSPENSA','CANCELADA','EXPIRADA']) as st(status)
  left join subscriptions s on s.status = st.status
  left join plans p on p.id = s.plan_id
  where is_manager()
  group by st.status;
$$;
