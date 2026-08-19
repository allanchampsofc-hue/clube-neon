-- ============================================================================
-- Clube Neon — troca de senha pelo próprio cliente
--
-- log_auth_event ganha PASSWORD_CHANGED no allowlist. É um evento de
-- identidade sobre si mesmo (o user_id vem sempre de auth.uid(), o
-- chamador nunca escolhe), exatamente o que essa função já cobre pra
-- LOGIN/LOGOUT/CHECKOUT — por isso entra aqui e não em log_audit_event,
-- cujo caminho de autoatendimento é restrito a eventos de cadastro.
--
-- PASSWORD_RESET_BY_STAFF (redefinição feita pela equipe no painel) não
-- precisa de mudança nenhuma: vai por log_audit_event, que já aceita
-- qualquer ação quando quem chama é staff/service_role.
-- ============================================================================

create or replace function log_auth_event(p_action text)
returns audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log audit_logs%rowtype;
begin
  if p_action not in ('LOGIN', 'LOGOUT', 'ADMIN_LOGIN', 'CHECKOUT', 'PASSWORD_CHANGED') then
    raise exception 'Ação de auditoria inválida: %', p_action;
  end if;

  insert into audit_logs (user_id, action, entity, entity_id)
  values (auth.uid(), p_action, 'auth', auth.uid())
  returning * into v_log;

  return v_log;
end;
$$;
