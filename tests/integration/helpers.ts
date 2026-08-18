import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { __resetCookies } from "next/headers";

/**
 * Helpers de teste de integração. Tudo aqui bate no Supabase REAL do
 * .env.test — nada de mock de banco. O único "fake" é o cookie-jar do
 * next/headers (ver tests/mocks/), necessário porque Server Actions só
 * funcionam com cookies() dentro do request scope real do Next.
 */

export function hasTestEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Prefixo em todo e-mail/dado criado por teste — facilita achar lixo órfão manualmente se algo falhar no meio. */
export const TEST_PREFIX = "test-clube-neon";

export function testEmail(label: string): string {
  return `${TEST_PREFIX}-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
}

export async function createTestAuthUser(email: string, password: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste: ${error?.message}`);
  }
  return data.user.id;
}

export async function assignTestRole(userId: string, roleCode: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_code: roleCode });
  if (error) throw new Error(`Falha ao atribuir role de teste: ${error.message}`);
}

export async function createTestCustomer(params: {
  userId?: string | null;
  name: string;
  email: string;
  cpf?: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .insert({
      user_id: params.userId ?? null,
      name: params.name,
      email: params.email,
      cpf: params.cpf ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar cliente de teste: ${error.message}`);
  return data.id as string;
}

export async function createActiveSubscriptionWithCredit(customerId: string) {
  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!plan) throw new Error("Nenhum plano ativo — rode as seeds antes dos testes.");

  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({ customer_id: customerId, plan_id: plan.id })
    .select("id")
    .single();
  if (subError) throw new Error(subError.message);

  const { error: activateError } = await admin.rpc("activate_subscription", {
    p_subscription_id: subscription.id,
  });
  if (activateError) throw new Error(activateError.message);

  const { data: wallet } = await admin
    .from("credit_wallets")
    .select("id, balance_cents")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return { subscriptionId: subscription.id as string, walletId: wallet.id as string, balanceCents: wallet.balance_cents as number };
}

/** Cria a subscription PENDENTE sem ativar — pra testar o efeito de activate_subscription isoladamente. */
export async function createPendingSubscription(customerId: string) {
  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!plan) throw new Error("Nenhum plano ativo — rode as seeds antes dos testes.");

  const { data: subscription, error } = await admin
    .from("subscriptions")
    .insert({ customer_id: customerId, plan_id: plan.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return subscription.id as string;
}

/** Ordem importa: FKs "restrict" em customer_id exigem apagar o ledger antes. */
export async function cleanupTestCustomer(customerId: string) {
  const admin = createAdminClient();
  await admin.from("referrals").delete().eq("referrer_customer_id", customerId);
  await admin.from("referrals").delete().eq("referred_customer_id", customerId);
  await admin.from("credit_transactions").delete().eq("customer_id", customerId);
  await admin.from("subscriptions").delete().eq("customer_id", customerId);
  await admin.from("customers").delete().eq("id", customerId);
}

export async function cleanupTestAuthUser(userId: string) {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

/** Loga como o usuário de teste — popula o cookie-jar mockado, igual signInWithPassword faria numa Server Action de verdade. */
export async function signInTestUser(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Falha ao logar usuário de teste: ${error.message}`);
}

export function resetSession() {
  __resetCookies();
}
