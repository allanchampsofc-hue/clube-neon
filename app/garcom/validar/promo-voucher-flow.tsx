"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "../pin-pad";
import { touchWaiterSession, clearWaiterSession } from "../session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";

const CODE_LENGTH = 6;

type FoundData = {
  campaignName: string;
  benefitDescription: string;
  validUntil: string;
};

type ConfirmedData = {
  campaignName: string;
  benefitDescription: string;
};

type Screen =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "found"; data: FoundData }
  | { name: "confirming"; data: FoundData }
  | { name: "success"; data: ConfirmedData }
  | { name: "error"; message: string };

export function PromoVoucherFlow({ pin }: { pin: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [screen, setScreen] = useState<Screen>({ name: "idle" });
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }, 2500);
    }
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [screen]);

  async function callApi(action: "lookup" | "redeem", code: string) {
    const res = await fetch("/api/garcom/voucher-avulso", {
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
      setScreen({ name: "error", message: result.body.error ?? "Voucher inválido ou expirado." });
      return;
    }
    setScreen({ name: "found", data: result.body });
  }

  async function handleConfirm() {
    if (screen.name !== "found") return;
    touchWaiterSession();
    setScreen({ name: "confirming", data: screen.data });
    const result = await callApi("redeem", digits);
    if (!result) return;
    if (!result.ok) {
      setScreen({ name: "error", message: result.body.error ?? "Não foi possível confirmar." });
      return;
    }
    setScreen({ name: "success", data: result.body });
  }

  function handleDigit(digit: string) {
    if (screen.name !== "idle" || digits.length >= CODE_LENGTH) return;
    touchWaiterSession();
    const next = digits + digit;
    setDigits(next);
    if (next.length === CODE_LENGTH) {
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

  return (
    <>
      {screen.name === "idle" || screen.name === "loading" ? (
        <>
          <p className="text-lg text-muted-foreground">Digite o código do voucher avulso</p>
          <div className="flex gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <div
                key={i}
                className="flex h-14 w-11 items-center justify-center rounded-xl border-2 border-primary text-2xl font-bold text-primary"
              >
                {digits[i] ?? ""}
              </div>
            ))}
          </div>
          {screen.name === "loading" ? (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          ) : (
            <PinPad onDigit={handleDigit} onBackspace={handleBackspace} className="w-64 text-primary" />
          )}
        </>
      ) : null}

      {screen.name === "found" || screen.name === "confirming" ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>✅ Voucher válido</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Campanha: </span>
              {screen.data.campaignName}
            </p>
            <p className="font-medium">{screen.data.benefitDescription}</p>
            <p>
              <span className="text-muted-foreground">Válido até: </span>
              {formatDate(screen.data.validUntil)}
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
                {screen.name === "confirming" ? "Confirmando..." : "✓ Confirmar uso"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {screen.name === "success" ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-primary px-10 py-8 text-center text-primary-foreground">
          <p className="text-2xl font-bold">✅ Voucher utilizado!</p>
          <p>{screen.data.campaignName}</p>
          <p className="text-sm text-primary-foreground/90">{screen.data.benefitDescription}</p>
        </div>
      ) : null}

      {screen.name === "error" ? (
        <p className="text-center text-lg font-medium text-destructive">{screen.message}</p>
      ) : null}
    </>
  );
}
