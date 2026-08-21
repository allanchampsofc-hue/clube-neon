"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredWaiterPin, clearWaiterSession } from "../session";
import { Button } from "@/components/ui/button";
import { CreditFlow } from "./credit-flow";
import { VoucherFlow } from "./voucher-flow";

export function useWaiterSession(): string | null {
  const router = useRouter();
  const [pin, setPin] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredWaiterPin();
    if (!stored) {
      router.replace("/garcom");
      return;
    }
    setPin(stored);

    const interval = setInterval(() => {
      if (!getStoredWaiterPin()) {
        router.replace("/garcom");
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [router]);

  return pin;
}

export default function GarcomValidarPage() {
  const router = useRouter();
  const pin = useWaiterSession();
  const [mode, setMode] = useState<"credito" | "voucher">("credito");

  function handleSair() {
    clearWaiterSession();
    router.push("/garcom");
  }

  if (!pin) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-heading font-bold text-primary">
          Clube Neon — Validação de Crédito
        </span>
        <Button variant="outline" size="sm" onClick={handleSair}>
          Sair
        </Button>
      </header>

      <div className="flex justify-center gap-2 border-b border-border bg-card px-4 py-2">
        <Button
          size="sm"
          variant={mode === "credito" ? "default" : "outline"}
          onClick={() => setMode("credito")}
        >
          Crédito
        </Button>
        <Button
          size="sm"
          variant={mode === "voucher" ? "default" : "outline"}
          onClick={() => setMode("voucher")}
        >
          Voucher
        </Button>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        {mode === "credito" ? <CreditFlow pin={pin} /> : <VoucherFlow pin={pin} />}
      </main>
    </div>
  );
}
