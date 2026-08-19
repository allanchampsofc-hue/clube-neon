"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import { createCreditUseRequest, cancelCreditUseRequest } from "./actions";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200; // ~10 minutos

type Step =
  | { name: "amount" }
  | {
      name: "code";
      requestId: string;
      qrUrl: string;
      validationCode: string;
      expiresAt: string;
      amountCents: number;
    }
  | { name: "success"; amountCents: number; balanceAfterCents: number | null }
  | { name: "expired" };

type StatusResponse = {
  status: "PENDING" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  amountCents: number;
  balanceAfterCents: number | null;
};

function centsFromInput(raw: string): number | null {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function UsarCreditoFlow({ balanceCents }: { balanceCents: number }) {
  const [step, setStep] = useState<Step>({ name: "amount" });
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (step.name !== "code") return;

    const expiresAtMs = new Date(step.expiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) setStep({ name: "expired" });
    };
    tick();
    const countdown = setInterval(tick, 1000);

    pollCountRef.current = 0;
    const poll = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        setStep({ name: "expired" });
        return;
      }
      try {
        const res = await fetch(`/api/credit-use-requests/${step.requestId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (data.status === "CONFIRMED") {
          setStep({
            name: "success",
            amountCents: data.amountCents,
            balanceAfterCents: data.balanceAfterCents,
          });
        } else if (data.status === "EXPIRED") {
          setStep({ name: "expired" });
        } else if (data.status === "CANCELLED") {
          setStep({ name: "amount" });
        }
      } catch {
        // Erro de rede pontual — a próxima tentativa de poll resolve.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(countdown);
      clearInterval(poll);
    };
  }, [step]);

  async function handleGenerate() {
    setError(null);
    const amountCents = centsFromInput(amountInput);
    if (amountCents === null) {
      setError("Digite um valor válido.");
      return;
    }
    if (amountCents < 100) {
      setError("O valor mínimo é R$ 1,00.");
      return;
    }
    if (amountCents > balanceCents) {
      setError("Esse valor é maior que o seu saldo disponível.");
      return;
    }

    setLoading(true);
    const result = await createCreditUseRequest(amountCents);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep({
      name: "code",
      requestId: result.requestId,
      qrUrl: result.qrUrl,
      validationCode: result.validationCode,
      expiresAt: result.expiresAt,
      amountCents: result.amountCents,
    });
  }

  async function handleCancel(requestId: string) {
    setLoading(true);
    await cancelCreditUseRequest(requestId);
    setLoading(false);
    setStep({ name: "amount" });
  }

  if (step.name === "amount") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Quanto você quer usar?</CardTitle>
          <CardDescription>
            Saldo disponível: {formatCents(balanceCents)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0,00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? "Gerando..." : "Gerar código"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step.name === "code") {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Informe este código ao garçom</CardTitle>
          <CardDescription>
            Expira em {minutes}:{seconds.toString().padStart(2, "0")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Seu código:</p>
          <div className="flex gap-2">
            {step.validationCode.split("").map((digit, i) => (
              <div
                key={i}
                className="flex h-28 w-20 items-center justify-center rounded-xl border-2 border-secondary bg-secondary/10 text-8xl leading-none font-bold text-secondary"
              >
                {digit}
              </div>
            ))}
          </div>
          <p className="text-2xl font-bold text-primary">
            {formatCents(step.amountCents)}
          </p>

          <details className="w-full text-center">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Prefere QR Code?
            </summary>
            <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
              <QRCodeSVG value={step.qrUrl} size={120} />
            </div>
          </details>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancel(step.requestId)}
            disabled={loading}
          >
            Cancelar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step.name === "expired") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Código expirado</CardTitle>
          <CardDescription>Gere um novo código pra continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setStep({ name: "amount" })}>Gerar novo código</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md border-secondary bg-secondary/10">
      <CardHeader>
        <CardTitle>✅ {formatCents(step.amountCents)} utilizados com sucesso!</CardTitle>
        {step.balanceAfterCents !== null ? (
          <CardDescription>
            Saldo restante: {formatCents(step.balanceAfterCents)}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-primary">
          Bom apetite! Aproveite sua experiência. 🍕
        </p>
        <a href="/minha-conta" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Voltar para minha conta
        </a>
      </CardContent>
    </Card>
  );
}
