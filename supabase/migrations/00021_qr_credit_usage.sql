-- ----------------------------------------------------------------------------
-- Fluxo de QR Code dinâmico para utilização de crédito pelo próprio cliente.
-- Segundo caminho, paralelo ao fluxo do operador em
-- /painel/utilizacao/nova/[customerId] (que continua intacto).
--
-- O cliente gera um pedido (create_credit_use_request), a aplicação assina um
-- JWT com esses dados (lib/qr-token.ts) e guarda o token na própria linha —
-- o JWT já se autovalida (assinatura + exp), e o token salvo serve de defesa
-- em profundidade: mesmo com assinatura válida, um token reapresentado depois
-- que o pedido virou CONFIRMED/CANCELLED/EXPIRED é rejeitado porque o status
-- na tabela (fonte de verdade) já não é mais PENDING.
-- ----------------------------------------------------------------------------

create table credit_use_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  wallet_id uuid not null references credit_wallets (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  token text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
  expires_at timestamptz not null,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  credit_transaction_id uuid references credit_transactions (id),
  created_at timestamptz not null default now()
);

create unique index credit_use_requests_token_idx on credit_use_requests (token);
create index credit_use_requests_customer_status_idx on credit_use_requests (customer_id, status);
create index credit_use_requests_expires_at_idx on credit_use_requests (expires_at) where status = 'PENDING';

alter table credit_use_requests enable row level security;

create policy "Cliente le proprios pedidos de QR" on credit_use_requests
  for select to authenticated using (customer_id = current_customer_id());
create policy "Staff le todos os pedidos de QR" on credit_use_requests
  for select to authenticated using (is_staff());
-- Sem policy de insert/update/delete: as três RPCs abaixo são security
-- definer e escrevem como owner, independente de RLS (mesmo padrão de
-- record_credit_transaction / credit_transactions).

-- ----------------------------------------------------------------------------
-- create_credit_use_request: chamada pelo próprio cliente ao gerar o QR.
-- p_id/p_token vêm prontos da aplicação (o token precisa do id do pedido no
-- payload do JWT, então o id é gerado em Next.js com crypto.randomUUID()
-- antes da chamada e passado explicitamente).
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
begin
  if p_customer_id <> current_customer_id() then
    raise exception 'Acesso negado: só é possível gerar QR Code para a própria conta.';
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

  -- Só 1 QR ativo por vez: cancela qualquer pedido PENDING anterior do cliente.
  update credit_use_requests
  set status = 'CANCELLED'
  where customer_id = p_customer_id
    and status = 'PENDING';

  insert into credit_use_requests (id, customer_id, wallet_id, amount_cents, token, expires_at)
  values (p_id, p_customer_id, v_wallet.id, p_amount_cents, p_token, now() + interval '5 minutes')
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
-- confirm_credit_use_request: chamada pelo operador depois de escanear o QR.
-- Idempotente: uma segunda chamada com o mesmo request (já CONFIRMED) falha
-- sem debitar de novo.
-- ----------------------------------------------------------------------------
create or replace function confirm_credit_use_request(
  p_request_id uuid,
  p_operator_id uuid,
  p_token text
)
returns credit_use_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request credit_use_requests%rowtype;
  v_transaction credit_transactions%rowtype;
begin
  if not is_staff() then
    raise exception 'Acesso negado: apenas a equipe pode confirmar utilizações.';
  end if;

  select * into v_request
  from credit_use_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Pedido de utilização não encontrado.';
  end if;

  if v_request.token <> p_token then
    raise exception 'Código do QR não confere com o pedido.';
  end if;

  if v_request.status = 'CONFIRMED' then
    raise exception 'Este QR já foi utilizado.';
  end if;

  if v_request.status = 'CANCELLED' then
    raise exception 'Este QR foi cancelado pelo cliente.';
  end if;

  if v_request.status = 'EXPIRED' or v_request.expires_at < now() then
    update credit_use_requests set status = 'EXPIRED' where id = v_request.id;
    raise exception 'Este QR expirou. Peça ao cliente para gerar um novo.';
  end if;

  select * into v_transaction
  from record_credit_transaction(
    v_request.wallet_id,
    'UTILIZACAO',
    -v_request.amount_cents,
    'Uso via QR Code',
    p_operator_id
  );

  update credit_use_requests
  set status = 'CONFIRMED',
      confirmed_by = p_operator_id,
      confirmed_at = now(),
      credit_transaction_id = v_transaction.id
  where id = v_request.id
  returning * into v_request;

  insert into audit_logs (user_id, action, entity, entity_id, after_state)
  values (
    p_operator_id,
    'CREDIT_USE_REQUEST_CONFIRMED',
    'credit_use_request',
    v_request.id,
    jsonb_build_object('amount_cents', v_request.amount_cents, 'credit_transaction_id', v_transaction.id)
  );

  return v_request;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_credit_use_request: cancelamento pelo próprio cliente (botão
-- "Cancelar" no passo 2) ou pela equipe (botão "Cancelar" na confirmação).
-- ----------------------------------------------------------------------------
create or replace function cancel_credit_use_request(p_request_id uuid)
returns credit_use_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request credit_use_requests%rowtype;
begin
  select * into v_request
  from credit_use_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Pedido de utilização não encontrado.';
  end if;

  if not (is_staff() or v_request.customer_id = current_customer_id()) then
    raise exception 'Acesso negado.';
  end if;

  if v_request.status <> 'PENDING' then
    raise exception 'Este pedido não está mais pendente.';
  end if;

  update credit_use_requests
  set status = 'CANCELLED'
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

-- ----------------------------------------------------------------------------
-- expire_old_credit_use_requests: chamada pelo cron diário (na prática, a
-- cada request feito também vale a checagem em confirm_credit_use_request,
-- mas isto limpa os que nunca chegaram a ser escaneados).
-- ----------------------------------------------------------------------------
create or replace function expire_old_credit_use_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Acesso negado: apenas processos do sistema podem expirar pedidos.';
  end if;

  update credit_use_requests
  set status = 'EXPIRED'
  where status = 'PENDING'
    and expires_at < now();

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into audit_logs (action, entity, after_state)
    values ('CREDIT_USE_REQUEST_EXPIRED', 'credit_use_request', jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;
