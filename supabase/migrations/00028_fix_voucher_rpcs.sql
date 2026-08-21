-- ----------------------------------------------------------------------------
-- Corrige 2 bugs reais encontrados pelos testes de integração ao rodar contra
-- a migration 00027 já aplicada:
--
-- 1) generate_bimonthly_voucher / generate_monthly_frete eram declaradas
--    "returns vouchers" (um único registro composto). Um "return null;" em
--    plpgsql, nesse caso, não devolve zero linhas: o PostgREST expande o
--    composto NULL com "select *", produzindo uma linha com todas as colunas
--    NULL — não a ausência de linha que o código (e os testes) esperavam.
--    Corrigido para "returns setof vouchers" + "return;"/"return next", que
--    de fato devolve zero linhas quando não há voucher a gerar.
--
-- 2) redeem_voucher, ao encontrar um voucher expirado, fazia UPDATE seguido
--    de RAISE EXCEPTION na mesma chamada — a exceção reverte a transação
--    inteira da chamada, desfazendo também o UPDATE. O status EXPIRADO nunca
--    era persistido nesse caminho. Corrigido para devolver a linha já
--    atualizada (sem erro), do mesmo jeito que a ação "lookup" da rota
--    /api/garcom/voucher já fazia — quem chama trata status <> 'DISPONIVEL'
--    (nem UTILIZADO nem já vinha certo) como rejeição.
-- ----------------------------------------------------------------------------

-- O tipo de retorno muda de "vouchers" (linha única) pra "setof vouchers"
-- (zero ou uma linha) — Postgres não deixa "create or replace" trocar o tipo
-- de retorno, precisa dropar antes.
drop function if exists generate_bimonthly_voucher(uuid);
drop function if exists generate_monthly_frete(uuid);

create or replace function generate_bimonthly_voucher(p_subscription_id uuid)
returns setof vouchers
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
    return;
  end if;

  if exists (
    select 1 from vouchers
    where subscription_id = p_subscription_id
      and voucher_type = 'PIZZA_2X1'
      and cycle_number = v_cycle.cycle_number
  ) then
    return;
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

  return next v_voucher;
end;
$$;

create or replace function generate_monthly_frete(p_subscription_id uuid)
returns setof vouchers
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
    return;
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
    return;
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

  return next v_voucher;
end;
$$;

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
    update vouchers
    set status = 'EXPIRADO'
    where id = v_voucher.id
    returning * into v_voucher;
    return v_voucher;
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
