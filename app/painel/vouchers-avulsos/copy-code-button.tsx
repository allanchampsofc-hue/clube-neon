"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markPromoVoucherSent } from "./actions";

/**
 * Copia o código pro clipboard e, no primeiro clique, marca o voucher como
 * "enviado" (sent_at) — só um sinalizador visual, não trava nada. Ideia: numa
 * lista de códigos gerados em lote, fica claro pra quem está copiando/
 * mandando um por um quais já foram entregues, evitando repetir o mesmo
 * código pra dois clientes diferentes.
 */
export function CopyCodeButton({
  voucherId,
  code,
  initialSent,
}: {
  voucherId: string;
  code: string;
  initialSent: boolean;
}) {
  const [sent, setSent] = useState(initialSent);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard pode falhar (permissão, contexto não seguro) — segue o
      // fluxo mesmo assim, o código já está visível na tela pra copiar à mão.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (!sent) {
      setPending(true);
      try {
        await markPromoVoucherSent(voucherId);
        setSent(true);
      } catch {
        // se falhar em marcar, o código foi copiado mesmo assim — só não
        // ganha o selo "já enviado" dessa vez.
      } finally {
        setPending(false);
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant={sent ? "outline" : "secondary"} onClick={handleCopy} disabled={pending}>
        {copied ? "Copiado!" : sent ? "Copiar de novo" : "Copiar código"}
      </Button>
      {sent ? (
        <span className="text-xs font-medium text-secondary" title="Já foi copiado/marcado como enviado antes">
          ✓ Já enviado
        </span>
      ) : null}
    </div>
  );
}
