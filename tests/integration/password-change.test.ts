import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { changeOwnPassword } from "@/app/minha-conta/perfil/actions";
import { captureRedirect } from "next/navigation";
import {
  hasTestEnv,
  testEmail,
  resetSession,
  createTestAuthUser,
  createTestCustomer,
  signInTestUser,
  cleanupTestCustomer,
  cleanupTestAuthUser,
} from "./helpers";

const describeIfEnv = hasTestEnv() ? describe : describe.skip;

function pwdForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

async function canSignIn(email: string, password: string) {
  const admin = createAdminClient();
  // Client separado (anon) só pra testar credencial, sem tocar na sessão
  // mockada dos cookies do teste.
  const { createClient: createRawClient } = await import("@supabase/supabase-js");
  const raw = createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await raw.auth.signInWithPassword({ email, password });
  void admin;
  return !error;
}

describeIfEnv("troca de senha pelo próprio cliente (integração)", () => {
  const OLD_PASSWORD = "SenhaAntiga123";
  const NEW_PASSWORD = "SenhaNova456";
  let email: string;
  let userId: string;
  let customerId: string;

  beforeEach(async () => {
    resetSession();
    email = testEmail("troca-senha");
    userId = await createTestAuthUser(email, OLD_PASSWORD);
    customerId = await createTestCustomer({
      userId,
      name: "Cliente Troca Senha",
      email,
    });
    await signInTestUser(email, OLD_PASSWORD);
  });

  afterEach(async () => {
    await cleanupTestCustomer(customerId);
    await cleanupTestAuthUser(userId);
  });

  it("troca a senha quando a senha atual está correta", async () => {
    const url = await captureRedirect(() =>
      changeOwnPassword(
        pwdForm({
          current_password: OLD_PASSWORD,
          new_password: NEW_PASSWORD,
          confirm_password: NEW_PASSWORD,
        }),
      ),
    );
    expect(url).toContain("pwd_success=1");

    expect(await canSignIn(email, NEW_PASSWORD)).toBe(true);
    expect(await canSignIn(email, OLD_PASSWORD)).toBe(false);
  });

  it("rejeita senha atual errada e mantém a senha original", async () => {
    const url = await captureRedirect(() =>
      changeOwnPassword(
        pwdForm({
          current_password: "SenhaErrada999",
          new_password: NEW_PASSWORD,
          confirm_password: NEW_PASSWORD,
        }),
      ),
    );
    expect(decodeURIComponent(url)).toContain("Senha atual incorreta");

    expect(await canSignIn(email, OLD_PASSWORD)).toBe(true);
    expect(await canSignIn(email, NEW_PASSWORD)).toBe(false);
  });

  it("rejeita quando a confirmação não confere", async () => {
    const url = await captureRedirect(() =>
      changeOwnPassword(
        pwdForm({
          current_password: OLD_PASSWORD,
          new_password: NEW_PASSWORD,
          confirm_password: "OutraCoisa789",
        }),
      ),
    );
    expect(decodeURIComponent(url)).toContain("confirmação não confere");
    expect(await canSignIn(email, OLD_PASSWORD)).toBe(true);
  });

  it("rejeita senha nova curta demais", async () => {
    const url = await captureRedirect(() =>
      changeOwnPassword(
        pwdForm({
          current_password: OLD_PASSWORD,
          new_password: "curta",
          confirm_password: "curta",
        }),
      ),
    );
    expect(decodeURIComponent(url)).toContain("8 caracteres");
    expect(await canSignIn(email, OLD_PASSWORD)).toBe(true);
  });

  it("registra PASSWORD_CHANGED na auditoria", async () => {
    await captureRedirect(() =>
      changeOwnPassword(
        pwdForm({
          current_password: OLD_PASSWORD,
          new_password: NEW_PASSWORD,
          confirm_password: NEW_PASSWORD,
        }),
      ),
    );

    const admin = createAdminClient();
    const { data: logs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("action", "PASSWORD_CHANGED")
      .eq("user_id", userId);
    expect(logs).toHaveLength(1);
  });
});
