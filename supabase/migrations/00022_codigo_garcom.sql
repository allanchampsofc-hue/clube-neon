-- ----------------------------------------------------------------------------
-- Código de 4 dígitos como fluxo principal de utilização de crédito (o QR
-- Code de 00021 continua existindo como fallback secundário na mesma linha
-- de credit_use_requests — nenhuma coluna dele foi removida).
--
-- Nova tela /garcom, sem login Supabase (dispositivo físico da loja,
-- compartilhado pela equipe). Por não ter sessão, a proteção de acesso é só
-- o PIN — verificado inteiramente no servidor (Route Handler com
-- service_role) e nunca por RLS de usuário autenticado.
--
-- Desvio do pedido original: `validation_code`/`waiter_pin` viram `text` com
-- check de dígitos, não `char(4)` — `char(n)` faz padding com espaço quando
-- o valor é mais curto, o que é uma pegadinha clássica em comparação de
-- string/índice único e não traz nenhum benefício aqui já que o tamanho é
-- sempre validado pelo check constraint mesmo.
-- ----------------------------------------------------------------------------

alter table credit_use_requests
  add column validation_code text check (validation_code ~ '^[0-9]{4}$');

-- Único apenas entre os PENDING — depois de expirar/confirmar/cancelar, o
-- mesmo código de 4 dígitos pode ser reaproveidado por outro cliente.
create unique index credit_use_requests_validation_code_pending_idx
  on credit_use_requests (validation_code)
  where status = 'PENDING';

alter table system_config
  add column waiter_pin text not null default '0000'
    check (waiter_pin ~ '^[0-9]{4}$');

-- ----------------------------------------------------------------------------
-- create_credit_use_request: mesma lógica de 00021, agora também gerando um
-- validation_code de 4 dígitos único entre os PENDING (nunca '0000', que é
-- reservado). Substitui a versão anterior por completo (convenção do
-- projeto — nunca editar migration antiga).
-- ----------------------------------------------------------------------------
create or replace function create_credit_use_request(
  p_id uuid,
  p_customer_id uuid,
  p_amount_cents integer,
  p_token text
)
returns credit_use_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet credit_wallets%rowtype;
  v_subscription_status text;
  v_request credit_use_requests%rowtype;
  v_code text;
  v_attempt integer := 0;
begin
  if p_customer_id <> current_customer_id() then
    raise exception 'Acesso negado: só é possível gerar código para a própria conta.';
  end if;

  if p_amount_cents <= 0 then
    raise exception 'Valor precisa ser maior que zero.';
  end if;

  select cw.* into v_wallet
  from credit_wallets cw
  where cw.customer_id = p_customer_id
  order by cw.created_at desc
  limit 1;

  if not found then
    raise exception 'Nenhuma carteira de crédito encontrada para este cliente.';
  end if;

  select s.status into v_subscription_status
  from subscription_cycles sc
  join subscriptions s on s.id = sc.subscription_id
  where sc.id = v_wallet.cycle_id;

  if v_subscription_status is distinct from 'ATIVA' then
    raise exception 'Não é possível usar crédito: assinatura não está ativa (status: %)', coalesce(v_subscription_status, 'desconhecido');
  end if;

  if p_amount_cents > v_wallet.balance_cents then
    raise exception 'Saldo insuficiente: saldo atual R$ %', v_wallet.balance_cents / 100.0;
  end if;

  -- Só 1 pedido ativo por vez: cancela qualquer PENDING anterior do cliente
  -- (libera o validation_code dele pro índice único parcial também).
  update credit_use_requests
  set status = 'CANCELLED'
  where customer_id = p_customer_id
    and status = 'PENDING';

  loop
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_attempt := v_attempt + 1;
    exit when v_code <> '0000' and not exists (
      select 1 from credit_use_requests where validation_code = v_code and status = 'PENDING'
    );
    if v_attempt >= 10 then
      raise exception 'Não foi possível gerar um código único no momento — tente novamente.';
    end if;
  end loop;

  insert into credit_use_requests (id, customer_id, wallet_id, amount_cents, token, validation_code, expires_at)
  values (p_id, p_customer_id, v_wallet.id, p_amount_cents, p_token, v_code, now() + interval '5 minutes')
  returning * into v_request;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (
    auth.uid(),
    'CREDIT_USE_REQUEST_CREATED',
    'credit_use_request',
    v_request.id,
    jsonb_build_object('amount_cents', p_amount_cents)
  );

  return v_request;
end;
$$;

-- ----------------------------------------------------------------------------
-- confirm_by_code: chamada pela tela /garcom (sem sessão Supabase — só PIN,
-- verificado no Route Handler antes de chegar aqui). Por isso é restrita a
-- service_role, nunca a authenticated/anon — a proteção real contra
-- brute-force do código de 4 dígitos é o PIN + rate limit da API, não RLS.
-- ----------------------------------------------------------------------------
create or replace function confirm_by_code(p_code text)
returns table (
  request_id uuid,
  customer_id uuid,
  customer_name text,
  member_number text,
  membership_level text,
  amount_cents integer,
  balance_after_cents integer,
  credit_transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request credit_use_requests%rowtype;
  v_transaction credit_transactions%rowtype;
  v_customer customers%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: esta função só pode ser chamada pelo servidor.';
  end if;

  select * into v_request
  from credit_use_requests
  where validation_code = p_code
    and status = 'PENDING'
  for update;

  if not found then
    raise exception 'Código inválido ou já utilizado.';
  end if;

  if v_request.expires_at < now() then
    update credit_use_requests set status = 'EXPIRED' where id = v_request.id;
    raise exception 'Código expirado.';
  end if;

  select * into v_transaction
  from record_credit_transaction(
    v_request.wallet_id,
    'UTILIZACAO',
    -v_request.amount_cents,
    'Uso via código de 4 dígitos',
    null
  );

  update credit_use_requests
  set status = 'CONFIRMED',
      confirmed_at = now(),
      credit_transaction_id = v_transaction.id
  where id = v_request.id;

  select * into v_customer from customers where id = v_request.customer_id;

  insert into audit_logs (action, entity, entity_id, after_state)
  values (
    'CREDIT_USE_REQUEST_CONFIRMED_BY_CODE',
    'credit_use_request',
    v_request.id,
    jsonb_build_object('amount_cents', v_request.amount_cents, 'credit_transaction_id', v_transaction.id)
  );

  return query select
    v_request.id,
    v_customer.id,
    v_customer.name,
    v_customer.member_number,
    v_customer.membership_level,
    v_request.amount_cents,
    v_transaction.balance_after_cents,
    v_transaction.id;
end;
$$;
