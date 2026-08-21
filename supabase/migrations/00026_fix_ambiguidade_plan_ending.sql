-- ----------------------------------------------------------------------------
-- Bug real (achado pelo teste de integração, não hipotético): o parâmetro
-- OUT `subscription_id` de get_subscriptions_needing_plan_ending_notice
-- colidia com a coluna subscription_cycles.subscription_id referenciada sem
-- qualificação dentro da subquery correlacionada — "column reference
-- subscription_id is ambiguous". Mesma classe de bug já vista em
-- update_membership_levels (00017) com customer_id. Corrigido qualificando
-- a tabela na subquery.
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
      select subscription_cycles.id from subscription_cycles
      where subscription_cycles.subscription_id = s.id
      order by subscription_cycles.cycle_number desc
      limit 1
    );
end;
$$;
