-- ============================================================================
-- Clube Neon — vouchers avulsos (promocionais, sem vínculo com o clube)
--
-- Diferença de propósito em relação a `vouchers`: aquela tabela é o
-- benefício de quem já é assinante (subscription_id/customer_id NOT NULL,
-- nasce do rollover mensal). Esta aqui é uma venda pontual e avulsa — o
-- comprador não precisa ter conta, assinatura nem cadastro em `customers`.
-- Por isso é uma tabela nova, não uma extensão da existente: encaixar os
-- dois conceitos na mesma tabela exigiria tornar subscription_id/customer_id
-- opcionais lá, o que enfraqueceria a garantia hoje em vigor de que todo
-- voucher de clube pertence a uma assinatura real.
--
-- Código de 6 dígitos numéricos (não 4, pra não colidir por engano com os
-- códigos de voucher de clube na tela do garçom) — mantém o mesmo teclado
-- numérico já usado em /garcom/validar, sem UI nova. Sem vínculo de CPF/
-- assinatura, o código É o controle de acesso, então a proteção real vem
-- do rate limit por IP já existente na rota (10 tentativas/min) — never
-- brute-forçável em espaço de 1 milhão de combinações nesse ritmo.
-- ============================================================================

create table promo_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  campaign_name text not null,
  benefit_description text not null,
  price_paid_cents integer not null check (price_paid_cents >= 0),
  payment_method text not null check (payment_method in ('PIX', 'DINHEIRO', 'CARTAO')),
  buyer_name text,
  buyer_phone text,
  status text not null default 'DISPONIVEL'
    check (status in ('DISPONIVEL', 'UTILIZADO', 'EXPIRADO', 'CANCELADO')),
  valid_until timestamptz not null,
  created_by uuid references auth.users (id),
  used_at timestamptz,
  used_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index promo_vouchers_status_idx on promo_vouchers (status);
create index promo_vouchers_campaign_idx on promo_vouchers (campaign_name);

alter table promo_vouchers enable row level security;

create policy "Staff le todos os vouchers avulsos" on promo_vouchers
  for select to authenticated using (is_staff());
-- Sem policy de insert/update: só as RPCs abaixo (security definer) escrevem.

-- ----------------------------------------------------------------------------
-- generate_promo_vouchers: gera 1 ou vários códigos de uma vez (campanha em
-- lote). Cada código é único e vem sem comprador vinculado — o operador
-- pode preencher nome/telefone do comprador se quiser rastrear, mas não é
-- obrigatório, exatamente pra permitir "vendo e distribuo os códigos depois".
-- ----------------------------------------------------------------------------
create or replace function generate_promo_vouchers(
  p_campaign_name text,
  p_benefit_description text,
  p_price_paid_cents integer,
  p_payment_method text,
  p_quantity integer,
  p_valid_days integer,
  p_buyer_name text default null,
  p_buyer_phone text default null
)
returns setof promo_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer;
  v_voucher promo_vouchers%rowtype;
  i integer;
begin
  if not is_manager() then
    raise exception 'Acesso negado: apenas gerentes podem gerar vouchers avulsos.';
  end if;

  if p_quantity < 1 or p_quantity > 200 then
    raise exception 'Quantidade inválida: gere entre 1 e 200 códigos por vez.';
  end if;

  for i in 1..p_quantity loop
    v_attempt := 0;
    loop
      v_code := lpad(floor(random() * 1000000)::text, 6, '0');
      v_attempt := v_attempt + 1;
      exit when not exists (select 1 from promo_vouchers where code = v_code);
      if v_attempt >= 15 then
        raise exception 'Não foi possível gerar códigos únicos no momento — tente novamente.';
      end if;
    end loop;

    insert into promo_vouchers (
      code, campaign_name, benefit_description, price_paid_cents, payment_method,
      buyer_name, buyer_phone, valid_until, created_by
    )
    values (
      v_code, p_campaign_name, p_benefit_description, p_price_paid_cents, p_payment_method,
      p_buyer_name, p_buyer_phone, now() + (p_valid_days || ' days')::interval, auth.uid()
    )
    returning * into v_voucher;

    insert into audit_logs (user_id, action, entity, entity_id, after_state)
    values (auth.uid(), 'PROMO_VOUCHER_GENERATED', 'promo_voucher', v_voucher.id,
      jsonb_build_object('campaign_name', p_campaign_name, 'price_paid_cents', p_price_paid_cents));

    return next v_voucher;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- redeem_promo_voucher: mesma lógica de expiração-sem-rollback do
-- redeem_voucher (00028) — voucher vencido é marcado EXPIRADO e devolvido
-- sem erro, quem chama trata status <> 'DISPONIVEL' como rejeição.
-- ----------------------------------------------------------------------------
create or replace function redeem_promo_voucher(p_code text, p_operator_id uuid)
returns promo_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher promo_vouchers%rowtype;
begin
  if not (is_staff() or auth.role() = 'service_role') then
    raise exception 'Acesso negado.';
  end if;

  select * into v_voucher from promo_vouchers where code = p_code for update;
  if not found then
    raise exception 'Voucher não encontrado.';
  end if;

  if v_voucher.status = 'UTILIZADO' then
    raise exception 'Este voucher já foi utilizado.';
  end if;

  if v_voucher.status = 'CANCELADO' then
    raise exception 'Este voucher foi cancelado.';
  end if;

  if v_voucher.status = 'EXPIRADO' or v_voucher.valid_until < now() then
    update promo_vouchers
    set status = 'EXPIRADO'
    where id = v_voucher.id
    returning * into v_voucher;
    return v_voucher;
  end if;

  update promo_vouchers
  set status = 'UTILIZADO', used_at = now(), used_by = p_operator_id
  where id = v_voucher.id
  returning * into v_voucher;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (p_operator_id, 'PROMO_VOUCHER_REDEEMED', 'promo_voucher', v_voucher.id,
    jsonb_build_object('campaign_name', v_voucher.campaign_name));

  return v_voucher;
end;
$$;

-- ----------------------------------------------------------------------------
-- expire_old_promo_vouchers: mesmo padrão de expire_old_vouchers (00027),
-- chamada pelo cron diário já existente.
-- ----------------------------------------------------------------------------
create or replace function expire_old_promo_vouchers()
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

  update promo_vouchers
  set status = 'EXPIRADO'
  where status = 'DISPONIVEL'
    and valid_until < now();

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into audit_logs (action, entity, after_state)
    values ('PROMO_VOUCHERS_EXPIRED', 'promo_voucher', jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_promo_voucher: pra estorno/erro de digitação — GERENTE+ só.
-- ----------------------------------------------------------------------------
create or replace function cancel_promo_voucher(p_voucher_id uuid)
returns promo_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher promo_vouchers%rowtype;
begin
  if not is_manager() then
    raise exception 'Acesso negado: apenas gerentes podem cancelar vouchers avulsos.';
  end if;

  select * into v_voucher from promo_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'Voucher não encontrado.';
  end if;

  if v_voucher.status = 'UTILIZADO' then
    raise exception 'Este voucher já foi utilizado, não pode ser cancelado.';
  end if;

  update promo_vouchers
  set status = 'CANCELADO'
  where id = p_voucher_id
  returning * into v_voucher;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (auth.uid(), 'PROMO_VOUCHER_CANCELLED', 'promo_voucher', v_voucher.id, null);

  return v_voucher;
end;
$$;
