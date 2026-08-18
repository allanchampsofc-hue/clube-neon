"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, reaisToCents } from "@/lib/money";
import { calculateCashback } from "@/lib/cashback-rules";

export function CashbackUsageFields({
  maxBalanceReais,
  defaultAmount,
  defaultOrderTotal,
  cashbackEnabled,
  cashbackPercentage,
  cashbackMaxCents,
  hasPendingReferral,
}: {
  maxBalanceReais: string;
  defaultAmount?: string;
  defaultOrderTotal?: string;
  cashbackEnabled: boolean;
  cashbackPercentage: number;
  cashbackMaxCents: number;
  hasPendingReferral: boolean;
}) {
  const [amount, setAmount] = useState(defaultAmount ?? "");
  const [orderTotal, setOrderTotal] = useState(defaultOrderTotal ?? "");

  const amountCents = Number.isFinite(Number(amount)) ? reaisToCents(Number(amount)) : 0;
  const orderTotalCents = Number.isFinite(Number(orderTotal))
    ? reaisToCents(Number(orderTotal))
    : 0;
  const extraSpentCents = orderTotalCents - amountCents;
  const cashbackPreviewCents =
    cashbackEnabled && !hasPendingReferral
      ? calculateCashback(extraSpentCents, cashbackPercentage, cashbackMaxCents)
      : 0;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Valor a debitar (R$)</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={maxBalanceReais}
          required
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order_total">Valor total do pedido (R$) — opcional</Label>
        <Input
          id="order_total"
          name="order_total"
          type="number"
          step="0.01"
          min="0"
          value={orderTotal}
          onChange={(e) => setOrderTotal(e.target.value)}
        />
      </div>
      {orderTotal ? (
        hasPendingReferral ? (
          <p className="text-sm text-muted-foreground">
            ℹ️ Cashback não disponível: cliente tem benefício de indicação ativo.
          </p>
        ) : cashbackPreviewCents > 0 ? (
          <p className="text-sm text-secondary-foreground">
            💰 Cliente vai ganhar {formatCents(cashbackPreviewCents)} de cashback no
            próximo ciclo
          </p>
        ) : null
      ) : null}
    </>
  );
}
