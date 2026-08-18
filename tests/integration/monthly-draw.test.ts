import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestCustomer,
  createActiveSubscriptionWithCredit,
  cleanupTestCustomer,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

describeIfEnv("sorteio mensal (integração)", () => {
  const customerIds: string[] = [];
  const currentMonth = new Date().toISOString().slice(0, 7);

  afterAll(async () => {
    const admin = createAdminClient();
    // Limpa o sorteio do mês corrente criado pelo teste, pra não bloquear
    // (nem forjar) o sorteio real desse mês depois que os testes rodarem.
    await admin.from("monthly_draws").delete().eq("month", currentMonth);
    for (const id of customerIds) await cleanupTestCustomer(id);
  });

  beforeEach(() => {
    resetSession();
  });

  it("usuário anônimo não roda o sorteio", async () => {
    const supabaseAnon = await createClient();
    const { error } = await supabaseAnon.rpc("run_monthly_draw");
    expect(error).toBeTruthy();
    expect(error!.message).toContain("Acesso negado");
  });

  it("respeita elegibilidade (30 dias) e não repete o ganhador do mês anterior", async () => {
    const admin = createAdminClient();

    // Assinante recém-ativado (0 dias) nunca pode ser sorteado.
    const freshEmail = testEmail("sorteio-fresco");
    const freshId = await createTestCustomer({ name: "Cliente Recente", email: freshEmail });
    customerIds.push(freshId);
    await createActiveSubscriptionWithCredit(freshId);

    const { data: prevDraw } = await admin
      .from("monthly_draws")
      .select("winner_customer_id")
      .lt("month", currentMonth)
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin.rpc("run_monthly_draw").single();

    if (error) {
      // "já existe sorteio" ou "nenhum elegível" são aceitáveis aqui — só
      // não pode ser falha de autorização.
      expect(error.message).not.toContain("Acesso negado");
      return;
    }

    const draw = data as { winner_customer_id: string };
    expect(draw.winner_customer_id).not.toBe(freshId);
    if (prevDraw?.winner_customer_id) {
      expect(draw.winner_customer_id).not.toBe(prevDraw.winner_customer_id);
    }
  });

  it("é idempotente — não sorteia duas vezes no mesmo mês", async () => {
    const admin = createAdminClient();
    await admin.rpc("run_monthly_draw");
    const { error } = await admin.rpc("run_monthly_draw");
    expect(error).toBeTruthy();
  });
});
