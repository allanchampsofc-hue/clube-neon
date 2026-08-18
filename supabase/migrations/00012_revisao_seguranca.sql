-- ============================================================================
-- Clube Neon — revisão de segurança/RLS (ETAPA 19)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Escalação de privilégio em user_roles: "Admins gerenciam user_roles"
-- usava is_admin(), que é true pra ADMIN *e* SUPER_ADMIN — qualquer ADMIN
-- comum podia se auto-promover (ou promover qualquer um) a SUPER_ADMIN
-- inserindo direto em user_roles. Só SUPER_ADMIN pode conceder/revogar a
-- role SUPER_ADMIN; ADMIN continua livre pras demais.
-- ----------------------------------------------------------------------------

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role_code = 'SUPER_ADMIN'
  );
$$;

drop policy if exists "Admins gerenciam user_roles" on user_roles;

create policy "Admins gerenciam roles nao criticas" on user_roles
  for all to authenticated
  using (is_admin() and role_code <> 'SUPER_ADMIN')
  with check (is_admin() and role_code <> 'SUPER_ADMIN');

create policy "Super admins gerenciam qualquer role" on user_roles
  for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ----------------------------------------------------------------------------
-- 2. log_audit_event: o caminho de auto-log (cliente logando sobre o próprio
-- registro, ex. autocadastro no checkout) não restringia p_action — um
-- cliente autenticado podia chamar a RPC direto com qualquer ação e
-- before/after_state forjados sobre o próprio customer_id, poluindo a
-- trilha de auditoria. log_auth_event já fazia isso certo (allowlist fixo);
-- agora log_audit_event também restringe o caminho de ownership.
-- ----------------------------------------------------------------------------

create or replace function log_audit_event(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_ip_address inet default null
)
returns audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log audit_logs%rowtype;
  v_owns_entity boolean := false;
  v_is_privileged boolean;
begin
  v_is_privileged := is_staff() or auth.role() = 'service_role';

  if not v_is_privileged then
    if p_entity = 'customer' and p_entity_id is not null then
      v_owns_entity := exists (
        select 1 from customers where id = p_entity_id and user_id = auth.uid()
      );
    elsif p_entity = 'subscription' and p_entity_id is not null then
      v_owns_entity := exists (
        select 1 from subscriptions s
        join customers c on c.id = s.customer_id
        where s.id = p_entity_id and c.user_id = auth.uid()
      );
    end if;

    if not v_owns_entity then
      raise exception 'Acesso negado.';
    end if;

    if p_action not in ('CUSTOMER_CREATED', 'SUBSCRIPTION_CREATED') then
      raise exception 'Ação de auditoria não permitida por autoatendimento: %', p_action;
    end if;
  end if;

  insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state, ip_address)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_before_state, p_after_state, p_ip_address)
  returning * into v_log;

  return v_log;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPCs de relatório/dashboard: usavam "where is_manager()"/"where
-- is_staff()" como filtro silencioso — sem autorização, retornavam vazio ou
-- zerado em vez de erro. Não vazava dado real, mas mascarava falha de
-- autorização como "sem dados" e destoava do padrão das RPCs de escrita
-- (record_credit_transaction, activate_subscription), que sempre lançam
-- exceção explícita. Convertidas de "language sql" pra "language plpgsql"
-- com checagem explícita no início — mesmo corpo de consulta de antes,
-- só sem o "where is_manager()"/"where is_staff()" no final.
-- ----------------------------------------------------------------------------

create or replace function get_dashboard_metrics()
returns table (
  assinantes_ativos bigint,
  novos_assinantes_mes bigint,
  canceladas_mes bigint,
  inadimplentes bigint,
  receita_recorrente_cents bigint,
  credito_liberado_mes_cents bigint,
  credito_utilizado_mes_cents bigint
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
       where type = 'UTILIZACAO' and created_at >= date_trunc('month', now()));
end;
$$;

create or replace function get_subscribers_by_status()
returns table(status text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
  select st.status, count(s.id)
  from unnest(array['PENDENTE','ATIVA','INADIMPLENTE','SUSPENSA','CANCELADA','EXPIRADA']) as st(status)
  left join subscriptions s on s.status = st.status
  group by st.status;
end;
$$;

create or replace function get_new_subscribers_by_month(p_months integer default 6)
returns table(month date, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
  select gs.month::date, count(s.id)
  from generate_series(
    date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
    date_trunc('month', now()),
    interval '1 month'
  ) as gs(month)
  left join subscriptions s on date_trunc('month', s.started_at) = gs.month
  group by gs.month
  order by gs.month;
end;
$$;

create or replace function get_churn_by_month(p_months integer default 6)
returns table(month date, cancelled bigint, expired bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
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
  group by gs.month
  order by gs.month;
end;
$$;

create or replace function get_retention_by_month(p_months integer default 6)
returns table(month date, active_start bigint, active_end bigint, retention_rate numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
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
  order by month_start;
end;
$$;

create or replace function get_credits_summary(p_start timestamptz)
returns table(liberado_cents bigint, utilizado_cents bigint, expirado_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
  select
    coalesce(sum(amount_cents) filter (where type = 'CREDITO_MENSAL'), 0),
    coalesce(sum(-amount_cents) filter (where type = 'UTILIZACAO'), 0),
    coalesce(sum(-amount_cents) filter (where type = 'EXPIRACAO'), 0)
  from credit_transactions
  where created_at >= p_start;
end;
$$;

create or replace function get_top_credit_users(p_start timestamptz, p_limit integer default 10)
returns table(customer_id uuid, customer_name text, member_number text, total_utilizado_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
  select c.id, c.name, c.member_number, sum(-ct.amount_cents) as total_utilizado_cents
  from credit_transactions ct
  join customers c on c.id = ct.customer_id
  where ct.type = 'UTILIZACAO'
    and ct.created_at >= p_start
  group by c.id, c.name, c.member_number
  order by total_utilizado_cents desc
  limit p_limit;
end;
$$;

create or replace function get_mrr_by_month(p_months integer default 6)
returns table(month date, mrr_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
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
  order by m.month_start;
end;
$$;

create or replace function get_revenue_by_status()
returns table(status text, total_count bigint, total_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'Acesso negado: relatório restrito à gerência.';
  end if;

  return query
  select st.status, count(s.id), coalesce(sum(p.price_cents), 0)
  from unnest(array['PENDENTE','ATIVA','INADIMPLENTE','SUSPENSA','CANCELADA','EXPIRADA']) as st(status)
  left join subscriptions s on s.status = st.status
  left join plans p on p.id = s.plan_id
  group by st.status;
end;
$$;
