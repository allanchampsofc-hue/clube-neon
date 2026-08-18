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

async function recordUsage(walletId: string, amountCents = 1000) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("record_credit_transaction", {
      p_wallet_id: walletId,
      p_type: "UTILIZACAO",
      p_amount_cents: -amountCents,
      p_reason: "Teste de utilização",
    })
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

describeIfEnv("pesquisa de satisfação (integração)", () => {
  const customerIds: string[] = [];

  afterAll(async () => {
    for (const id of customerIds) await cleanupTestCustomer(id);
  });

  beforeEach(() => {
    resetSession();
  });

  it("usuário anônimo não chama nenhuma das RPCs de pesquisa", async () => {
    const supabaseAnon = await createClient();
    const rpcs: Array<[string, Record<string, unknown>]> = [
      ["create_survey_if_eligible", { p_credit_transaction_id: "00000000-0000-0000-0000-000000000000" }],
      ["get_pending_surveys_to_send", {}],
      ["mark_survey_sent", { p_survey_id: "00000000-0000-0000-0000-000000000000", p_whatsapp_message_id: "x" }],
      ["mark_survey_failed", { p_survey_id: "00000000-0000-0000-0000-000000000000" }],
      ["record_survey_answer", { p_phone: "5511999998888", p_score: 5, p_message_id: "x" }],
    ];
    for (const [fn, args] of rpcs) {
      const { error } = await supabaseAnon.rpc(fn, args);
      expect(error).toBeTruthy();
      expect(error!.message).toContain("Acesso negado");
    }
  });

  it("cria pesquisa PENDING quando o cliente tem telefone", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-com-telefone");
    const customerId = await createTestCustomer({
      name: "Cliente Com Telefone",
      email,
      phone: "11988887777",
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);

    const { data, error } = await admin
      .rpc("create_survey_if_eligible", { p_credit_transaction_id: usage.id })
      .single();
    expect(error).toBeNull();
    const survey = data as { status: string; customer_id: string };
    expect(survey.status).toBe("PENDING");
    expect(survey.customer_id).toBe(customerId);
  });

  it("não cria pesquisa quando o cliente não tem telefone", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-sem-telefone");
    const customerId = await createTestCustomer({ name: "Cliente Sem Telefone", email });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);

    const { data, error } = await admin.rpc("create_survey_if_eligible", {
      p_credit_transaction_id: usage.id,
    });
    expect(error).toBeNull();
    expect((data as { id: string | null } | null)?.id).toBeFalsy();
  });

  it("não cria uma segunda pesquisa no mesmo dia pro mesmo cliente", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-duplicada-dia");
    const customerId = await createTestCustomer({
      name: "Cliente Duas Utilizações",
      email,
      phone: "11988887777",
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);

    const firstUsage = await recordUsage(walletId, 500);
    const { data: firstSurvey, error: firstError } = await admin.rpc(
      "create_survey_if_eligible",
      { p_credit_transaction_id: firstUsage.id },
    );
    expect(firstError).toBeNull();
    expect((firstSurvey as { id: string | null } | null)?.id).toBeTruthy();

    const secondUsage = await recordUsage(walletId, 500);
    const { data: secondSurvey, error: secondError } = await admin.rpc(
      "create_survey_if_eligible",
      { p_credit_transaction_id: secondUsage.id },
    );
    expect(secondError).toBeNull();
    expect((secondSurvey as { id: string | null } | null)?.id).toBeFalsy();
  });

  it("não cria pesquisa com o toggle desativado, restaurando o valor original depois", async () => {
    const admin = createAdminClient();
    const { data: originalConfig } = await admin
      .from("system_config")
      .select("id, survey_enabled")
      .limit(1)
      .single();

    const email = testEmail("pesquisa-toggle-desativado");
    const customerId = await createTestCustomer({
      name: "Cliente Toggle Pesquisa",
      email,
      phone: "11988887777",
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);

    try {
      await admin
        .from("system_config")
        .update({ survey_enabled: false })
        .eq("id", originalConfig!.id);

      const { data, error } = await admin.rpc("create_survey_if_eligible", {
        p_credit_transaction_id: usage.id,
      });
      expect(error).toBeNull();
      expect((data as { id: string | null } | null)?.id).toBeFalsy();
    } finally {
      await admin
        .from("system_config")
        .update({ survey_enabled: originalConfig!.survey_enabled })
        .eq("id", originalConfig!.id);
    }
  });

  it("get_pending_surveys_to_send só traz pesquisas com 30+ minutos", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-delay");
    const customerId = await createTestCustomer({
      name: "Cliente Delay",
      email,
      phone: "11988887777",
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);

    const { data: surveyData } = await admin
      .rpc("create_survey_if_eligible", { p_credit_transaction_id: usage.id })
      .single();
    const survey = surveyData as { id: string };

    const { data: freshPending } = await admin.rpc("get_pending_surveys_to_send");
    const freshIds = (freshPending ?? []).map((r: { id: string }) => r.id);
    expect(freshIds).not.toContain(survey.id);

    await admin
      .from("satisfaction_surveys")
      .update({ created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() })
      .eq("id", survey.id);

    const { data: oldPending } = await admin.rpc("get_pending_surveys_to_send");
    const oldIds = (oldPending ?? []).map((r: { id: string }) => r.id);
    expect(oldIds).toContain(survey.id);
  });

  it("registra a resposta, atualiza status e é idempotente por answered_message_id", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-resposta");
    const phone = "11977776666";
    const customerId = await createTestCustomer({
      name: "Cliente Responde",
      email,
      phone,
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);

    const { data: surveyData } = await admin
      .rpc("create_survey_if_eligible", { p_credit_transaction_id: usage.id })
      .single();
    const survey = surveyData as { id: string };

    await admin.rpc("mark_survey_sent", {
      p_survey_id: survey.id,
      p_whatsapp_message_id: "outbound-msg-1",
    });

    const normalizedPhone = `55${phone}`;
    const { data: answered, error } = await admin
      .rpc("record_survey_answer", {
        p_phone: normalizedPhone,
        p_score: 5,
        p_message_id: "inbound-msg-1",
      })
      .single();
    expect(error).toBeNull();
    const answeredRow = answered as { status: string; score: number } | null;
    expect(answeredRow?.status).toBe("ANSWERED");
    expect(answeredRow?.score).toBe(5);

    const { data: duplicateAnswer } = await admin.rpc("record_survey_answer", {
      p_phone: normalizedPhone,
      p_score: 5,
      p_message_id: "inbound-msg-1",
    });
    expect((duplicateAnswer as { id: string | null } | null)?.id).toBeFalsy();

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("id")
      .eq("action", "SURVEY_ANSWERED")
      .eq("entity_id", survey.id);
    expect(auditRows).toHaveLength(1);
  });

  it("não responde pesquisa que ainda está PENDING (só aceita SENT)", async () => {
    const admin = createAdminClient();
    const email = testEmail("pesquisa-ainda-pendente");
    const phone = "11966665555";
    const customerId = await createTestCustomer({
      name: "Cliente Pendente",
      email,
      phone,
    });
    customerIds.push(customerId);
    const { walletId } = await createActiveSubscriptionWithCredit(customerId);
    const usage = await recordUsage(walletId);
    await admin.rpc("create_survey_if_eligible", { p_credit_transaction_id: usage.id });

    const { data } = await admin.rpc("record_survey_answer", {
      p_phone: `55${phone}`,
      p_score: 4,
      p_message_id: "inbound-msg-pendente",
    });
    expect((data as { id: string | null } | null)?.id).toBeFalsy();
  });
});
