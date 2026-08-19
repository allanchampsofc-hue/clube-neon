"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PinPad } from "./pin-pad";
import { WAITER_SESSION_KEY, WAITER_SESSION_AT_KEY } from "./session";

export default function GarcomPinPage() {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submitPin(pin: string) {
    setChecking(true);
    try {
      const res = await fetch("/api/garcom/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-waiter-pin": pin },
        body: JSON.stringify({ action: "check_pin" }),
      });
      if (res.ok) {
        sessionStorage.setItem(WAITER_SESSION_KEY, pin);
        sessionStorage.setItem(WAITER_SESSION_AT_KEY, String(Date.now()));
        router.push("/garcom/validar");
        return;
      }
      setError(true);
      setDigits("");
    } catch {
      setError(true);
      setDigits("");
    } finally {
      setChecking(false);
    }
  }

  function handleDigit(digit: string) {
    if (checking || digits.length >= 4) return;
    setError(false);
    const next = digits + digit;
    setDigits(next);
    if (next.length === 4) {
      submitPin(next);
    }
  }

  function handleBackspace() {
    setError(false);
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-primary px-6 text-primary-foreground">
      <div className="flex flex-col items-center gap-1">
        <span className="font-heading text-2xl font-bold">Clube Neon</span>
        <h1 className="text-lg text-primary-foreground/80">Acesso da Equipe</h1>
      </div>

      <div className={`flex gap-4 ${error ? "animate-[shake_0.4s]" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-secondary ${
              i < digits.length ? "bg-secondary" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      {error ? <p className="text-sm text-secondary">PIN incorreto</p> : null}

      <PinPad onDigit={handleDigit} onBackspace={handleBackspace} className="w-64" />

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
