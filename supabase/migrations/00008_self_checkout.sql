-- ============================================================================
-- Clube Neon — autocadastro no checkout (ETAPA 15)
--
-- 1. cpf vira opcional: o checkout pede CPF opcional ("pode ser informado
--    depois"). unique continua funcionando normalmente com múltiplos NULLs
--    (Postgres não considera NULL igual a NULL pra fins de unicidade).
-- 2. Até agora só staff podia inserir em customers/subscriptions (ETAPA 02).
--    O checkout público precisa que o próprio cliente recém-cadastrado crie
--    o seu registro — as policies novas restringem isso ao mínimo necessário:
--    só o próprio user_id, e só assinatura PENDENTE (nunca ATIVA direto,
--    isso continua exclusivo da RPC activate_subscription via staff/webhook).
-- ============================================================================

alter table customers alter column cpf drop not null;

create policy "Cliente cria proprio registro" on customers
  for insert to authenticated with check (user_id = auth.uid());

create policy "Cliente cria propria assinatura pendente" on subscriptions
  for insert to authenticated with check (
    customer_id = current_customer_id() and status = 'PENDENTE'
  );
