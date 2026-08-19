"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "../pin-pad";
import { getStoredWaiterPin, touchWaiterSession, clearWaiterSession } from "../session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MembershipBadge } from "@/components/membership-badge";
import { formatCents } from "@/lib/money";

type FoundData = {
  customerName: string;
  memberNumber: string;
  membershipLevel: string;
  amountCents: number;
  balanceCents: number;
  expiresAt: string;
};

type ConfirmedData = {
  customerName: string;
  amountCents: number;
  balanceAfterCents: number;
};

type Screen =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "found"; data: FoundData }
  | { name: "confirming"; data: FoundData }
  | { name: "success"; data: ConfirmedData }
  | { name: "error"; message: string };

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
  const [digits, setDigits] = useState("");
  const [screen, setScreen] = useState<Screen>({ name: "idle" });
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (screen.name !== "found") return;
    const expiresAtMs = new Date(screen.data.expiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) {
        setScreen({ name: "error", message: "Código expirado — peça ao cliente gerar novo." });
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    if (screen.name === "success") {
      clearTimerRef.current = setTimeout(() => {
        setScreen({ name: "idle" });
        setDigits("");
      }, 3000);
    } else if (screen.name === "error") {
      clearTimerRef.current = setTimeout(() => {
        setScreen({ name: "idle" });
        setDigits("");
      }, 2000);
    }
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [screen]);

  async function callApi(action: "lookup" | "confirm", code: string) {
    if (!pin) return null;
    const res = await fetch("/api/garcom/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-waiter-pin": pin },
      body: JSON.stringify({ code, action }),
    });
    if (res.status === 401) {
      clearWaiterSession();
      router.replace("/garcom");
      return null;
    }
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  async function handleLookup(code: string) {
    touchWaiterSession();
    setScreen({ name: "loading" });
    const result = await callApi("lookup", code);
    if (!result) return;
    if (!result.ok) {
      setScreen({ name: "error", message: result.body.error ?? "Código inválido ou expirado." });
      return;
    }
    setScreen({ name: "found", data: result.body });
  }

  async function handleConfirm() {
    if (screen.name !== "found") return;
    touchWaiterSession();
    setScreen({ name: "confirming", data: screen.data });
    const result = await callApi("confirm", digits);
    if (!result) return;
    if (!result.ok) {
      setScreen({ name: "error", message: result.body.error ?? "Não foi possível confirmar." });
      return;
    }
    setScreen({ name: "success", data: result.body });
  }

  function handleDigit(digit: string) {
    if (screen.name !== "idle" || digits.length >= 4) return;
    touchWaiterSession();
    const next = digits + digit;
    setDigits(next);
    if (next.length === 4) {
      handleLookup(next);
    }
  }

  function handleBackspace() {
    if (screen.name !== "idle") return;
    setDigits((d) => d.slice(0, -1));
  }

  function handleCancelLookup() {
    setScreen({ name: "idle" });
    setDigits("");
  }

  function handleSair() {
    clearWaiterSession();
    router.push("/garcom");
  }

  if (!pin) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

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

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        {screen.name === "idle" || screen.name === "loading" ? (
          <>
            <p className="text-lg text-muted-foreground">Digite o código do cliente</p>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex h-16 w-14 items-center justify-center rounded-xl border-2 border-primary text-3xl font-bold text-primary"
                >
                  {digits[i] ?? ""}
                </div>
              ))}
            </div>
            {screen.name === "loading" ? (
              <p className="text-sm text-muted-foreground">Buscando...</p>
            ) : (
              <PinPad
                onDigit={handleDigit}
                onBackspace={handleBackspace}
                className="w-64 text-primary"
              />
            )}
          </>
        ) : null}

        {screen.name === "found" || screen.name === "confirming" ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>🍕 Confirmar utilização</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Cliente: </span>
                {screen.data.customerName}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Membro: </span>
                {screen.data.memberNumber}
                <MembershipBadge level={screen.data.membershipLevel} />
              </p>
              <p>
                <span className="text-muted-foreground">Valor a debitar: </span>
                <span className="font-medium">{formatCents(screen.data.amountCents)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Saldo atual: </span>
                {formatCents(screen.data.balanceCents)}
              </p>
              <p>
                <span className="text-muted-foreground">Saldo após: </span>
                {formatCents(screen.data.balanceCents - screen.data.amountCents)}
              </p>
              <p className="text-muted-foreground">
                ⏱ Expira em: {minutes}:{seconds.toString().padStart(2, "0")}
              </p>

              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={handleCancelLookup} disabled={screen.name === "confirming"}>
                  ✗ Cancelar
                </Button>
                <Button
                  variant="secondary"
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                  onClick={handleConfirm}
                  disabled={screen.name === "confirming"}
                >
                  {screen.name === "confirming" ? "Confirmando..." : "✓ Confirmar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {screen.name === "success" ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-primary px-10 py-8 text-center text-primary-foreground">
            <p className="text-2xl font-bold">✅ Crédito utilizado!</p>
            <p>Cliente: {screen.data.customerName}</p>
            <p>{formatCents(screen.data.amountCents)} debitados</p>
            <p>Saldo restante: {formatCents(screen.data.balanceAfterCents)}</p>
          </div>
        ) : null}

        {screen.name === "error" ? (
          <p className="text-center text-lg font-medium text-destructive">{screen.message}</p>
        ) : null}
      </main>
    </div>
  );
}
