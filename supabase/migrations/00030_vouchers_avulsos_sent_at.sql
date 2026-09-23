-- ============================================================================
-- Marca de "já enviado" pro voucher avulso — pra evitar que o mesmo código
-- seja copiado e mandado pra dois clientes diferentes por engano. Não
-- bloqueia o resgate (isso continua controlado só por status/valid_until em
-- redeem_promo_voucher) — é só um sinalizador visual pro painel, pra quem
-- está copiando código pra código de uma lista em lote não perder a conta
-- de qual já foi entregue.
-- ============================================================================

alter table promo_vouchers add column sent_at timestamptz;

create or replace function mark_promo_voucher_sent(p_voucher_id uuid)
returns promo_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher promo_vouchers%rowtype;
begin
  if not is_manager() then
    raise exception 'Acesso negado: apenas gerentes podem marcar vouchers avulsos como enviados.';
  end if;

  update promo_vouchers
  set sent_at = now()
  where id = p_voucher_id
  returning * into v_voucher;

  if not found then
    raise exception 'Voucher não encontrado.';
  end if;

  return v_voucher;
end;
$$;
