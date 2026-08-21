"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "../pin-pad";
import { touchWaiterSession, clearWaiterSession } from "../session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { VOUCHER_TYPE_LABELS, PIZZA_2X1_RULES, FRETE_GRATIS_RULES, type VoucherType } from "@/lib/vouchers";

type FoundData = {
  customerName: string;
  voucherType: VoucherType;
  validUntil: string;
};

type ConfirmedData = {
  customerName: string;
  voucherType: VoucherType;
};

type Screen =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "found"; data: FoundData }
  | { name: "confirming"; data: FoundData }
  | { name: "success"; data: ConfirmedData }
  | { name: "error"; message: string };

const RULES: Record<VoucherType, string> = {
  PIZZA_2X1: PIZZA_2X1_RULES,
  FRETE_GRATIS: FRETE_GRATIS_RULES,
};

export function VoucherFlow({ pin }: { pin: string }) {
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
      }, 2000);
    }
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [screen]);

  async function callApi(action: "lookup" | "redeem", code: string) {
    const res = await fetch("/api/garcom/voucher", {
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

  return (
    <>
      {screen.name === "idle" || screen.name === "loading" ? (
        <>
          <p className="text-lg text-muted-foreground">Digite o código do voucher</p>
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
              <span className="text-muted-foreground">Cliente: </span>
              {screen.data.customerName}
            </p>
            <p>
              <span className="text-muted-foreground">Tipo: </span>
              <span className="font-medium">{VOUCHER_TYPE_LABELS[screen.data.voucherType]}</span>
            </p>
            <p className="text-muted-foreground">{RULES[screen.data.voucherType]}</p>
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
          <p>Cliente: {screen.data.customerName}</p>
          <p>{VOUCHER_TYPE_LABELS[screen.data.voucherType]}</p>
        </div>
      ) : null}

      {screen.name === "error" ? (
        <p className="text-center text-lg font-medium text-destructive">{screen.message}</p>
      ) : null}
    </>
  );
}
