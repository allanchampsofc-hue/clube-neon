/**
 * Integração com Z-API — usada pelas Features 2 (sorteio), 3 (aniversário) e
 * 6 (pesquisa de satisfação). Falha de envio nunca deve derrubar o fluxo
 * principal (sorteio, ativação etc.) — quem chama isto decide como reagir a
 * um erro (normalmente: logar e seguir).
 */

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<{ messageId: string | null }> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token || !clientToken) {
    throw new Error(
      "Z-API não configurada — ZAPI_INSTANCE_ID/ZAPI_TOKEN/ZAPI_CLIENT_TOKEN ausentes.",
    );
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({
      phone: formatPhoneE164(phone),
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar WhatsApp via Z-API (${response.status}): ${body}`);
  }

  const body = await response.json().catch(() => ({}) as Record<string, unknown>);
  const messageId =
    typeof body.messageId === "string"
      ? body.messageId
      : typeof body.zaapId === "string"
        ? body.zaapId
        : null;

  return { messageId };
}
