-- ============================================================================
-- Clube Neon — fix: update_membership_levels tinha "customer_id" ambíguo
--
-- O parâmetro de saída (OUT) "customer_id" da função vira uma variável
-- plpgsql implícita com esse nome. O UPDATE membership_history usava
-- "where customer_id = ..." sem qualificar a tabela, e o Postgres não
-- conseguia decidir entre a variável OUT e a coluna da tabela — erro
-- "column reference customer_id is ambiguous" toda vez que um cliente
-- realmente mudava de nível (achado pelos testes de integração da
-- Feature 4, rodando contra o banco real depois da migration 00016
-- aplicada). Corrige qualificando a coluna com o nome da tabela.
-- ============================================================================

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
      where membership_history.customer_id = v_customer.cid and ended_at is null;

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
