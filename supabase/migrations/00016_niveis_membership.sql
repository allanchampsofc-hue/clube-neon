-- ============================================================================
-- Clube Neon — Feature 4: Níveis de Membership
-- ============================================================================

alter table customers add column membership_level text not null default 'MEMBRO'
  check (membership_level in ('MEMBRO', 'OURO', 'BLACK'));
alter table customers add column membership_since timestamptz;

alter table system_config add column membership_ouro_message text not null default
  '🌟 Parabéns, {nome}! Você agora é membro OURO do Clube Neon! Seu novo benefício: 10% de desconto em bebidas. Até logo! 🍕';
alter table system_config add column membership_black_message text not null default
  '⭐ Parabéns, {nome}! Você agora é membro BLACK do Clube Neon! 15% de desconto em bebidas e sobremesas + acesso VIP a eventos. Obrigado pela sua fidelidade! 🍕';

-- ----------------------------------------------------------------------------
-- membership_history: histórico completo de evoluções, nunca apagado. Sem
-- policy de insert/update — só a RPC (security definer) escreve.
-- ----------------------------------------------------------------------------

create table membership_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  level text not null check (level in ('MEMBRO', 'OURO', 'BLACK')),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index membership_history_customer_id_idx on membership_history (customer_id);

alter table membership_history enable row level security;

create policy "Staff le membership_history" on membership_history
  for select to authenticated using (is_staff());
create policy "Cliente le proprio historico de nivel" on membership_history
  for select to authenticated using (customer_id = current_customer_id());

-- ----------------------------------------------------------------------------
-- update_membership_levels: roda no cron diário. Pra cada cliente com
-- assinatura, se ela não está ATIVA (cancelada, inadimplente, suspensa,
-- expirada, pendente), o nível é MEMBRO — sem exceção. Se está ATIVA, conta
-- quantos subscription_cycles consecutivos existem sem gap > 5 dias entre o
-- period_end de um e o period_start do próximo (tolerância a atraso do
-- cron; na prática os ciclos sempre encadeiam exatos, então isso quase
-- nunca vai realmente cortar a contagem). Ciclos de grace period entram na
-- contagem normalmente — são parte da mesma cadeia, não uma interrupção.
-- Só grava membership_history e manda notificação (isso é feito pelo
-- caller em TypeScript) quando o nível realmente muda.
-- ----------------------------------------------------------------------------

create or replace function update_membership_levels()
returns table (customer_id uuid, old_level text, new_level text, changed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_months integer;
  v_computed_level text;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado: apenas a equipe ou processos do sistema podem atualizar níveis de membership.';
  end if;

  for v_customer in
    select
      c.id as cid,
      c.membership_level as current_level,
      s.id as subscription_id,
      s.status as subscription_status
    from customers c
    left join lateral (
      select s2.id, s2.status
      from subscriptions s2
      where s2.customer_id = c.id
      order by s2.created_at desc
      limit 1
    ) s on true
  loop
    if v_customer.subscription_status is distinct from 'ATIVA' then
      v_computed_level := 'MEMBRO';
    else
      select count(*) into v_months
      from (
        select
          cycle_number,
          min(
            case
              when prev_end is null or period_start <= prev_end + interval '5 days'
              then 1 else 0
            end
          ) over (order by cycle_number rows between unbounded preceding and current row) as chain_ok
        from (
          select
            cycle_number,
            period_start,
            lag(period_end) over (order by cycle_number) as prev_end
          from subscription_cycles
          where subscription_id = v_customer.subscription_id
        ) t
      ) t2
      where chain_ok = 1;

      v_computed_level := case
        when v_months >= 12 then 'BLACK'
        when v_months >= 6 then 'OURO'
        else 'MEMBRO'
      end;
    end if;

    if v_computed_level is distinct from v_customer.current_level then
      update customers
      set membership_level = v_computed_level, membership_since = now()
      where id = v_customer.cid;

      update membership_history
      set ended_at = now()
      where customer_id = v_customer.cid and ended_at is null;

      insert into membership_history (customer_id, level, started_at)
      values (v_customer.cid, v_computed_level, now());

      insert into audit_logs (user_id, action, entity, entity_id, before_state, after_state)
      values (
        auth.uid(),
        'MEMBERSHIP_LEVEL_CHANGED',
        'customer',
        v_customer.cid,
        jsonb_build_object('level', v_customer.current_level),
        jsonb_build_object('level', v_computed_level)
      );
    end if;

    customer_id := v_customer.cid;
    old_level := v_customer.current_level;
    new_level := v_computed_level;
    changed := v_computed_level is distinct from v_customer.current_level;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_dashboard_metrics: adiciona membros_ouro e membros_black. Muda o tipo
-- de retorno, então precisa dropar antes.
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
  membros_black bigint
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
    (select count(*) from customers where membership_level = 'BLACK');
end;
$$;
