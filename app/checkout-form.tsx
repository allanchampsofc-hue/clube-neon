"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { checkout } from "./checkout-actions";

type PlanInfo = {
  monthlyPriceCents: number;
  annualPriceCents: number;
  monthlyCreditCents: number;
};

export function CheckoutForm({
  plans,
  initialPlanType,
  referralCreditCents,
  validReferral,
  refCode,
  checkoutError,
}: {
  plans: Record<"ESSENCIAL" | "COMPLETO", PlanInfo>;
  initialPlanType: "ESSENCIAL" | "COMPLETO";
  referralCreditCents: number;
  validReferral: boolean;
  refCode: string | null;
  checkoutError: string | null;
}) {
  const [planType, setPlanType] = useState<"ESSENCIAL" | "COMPLETO">(initialPlanType);
  const plan = plans[planType];
  const monthlyTotalCents = plan.monthlyPriceCents * 12;
  const annualSavingsCents = monthlyTotalCents - plan.annualPriceCents;

  return (
    <form action={checkout} className="flex flex-col gap-3">
      {checkoutError ? <p className="text-sm text-destructive">{checkoutError}</p> : null}

      {validReferral ? (
        <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3 text-sm text-primary-foreground">
          Você foi indicado por um amigo Neon! Ao ativar sua assinatura, ambos
          ganham {formatCents(referralCreditCents)} de crédito.
          <input type="hidden" name="ref" value={refCode ?? ""} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label>Plano</Label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
          <input
            type="radio"
            name="plan_type"
            value="ESSENCIAL"
            checked={planType === "ESSENCIAL"}
            onChange={() => setPlanType("ESSENCIAL")}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">Essencial</span>
            <span className="block text-muted-foreground">
              {formatCents(plans.ESSENCIAL.monthlyCreditCents)} de crédito/mês
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
          <input
            type="radio"
            name="plan_type"
            value="COMPLETO"
            checked={planType === "COMPLETO"}
            onChange={() => setPlanType("COMPLETO")}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">Completo ⭐</span>
            <span className="block text-muted-foreground">
              {formatCents(plans.COMPLETO.monthlyCreditCents)} de crédito/mês + vouchers
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Telefone</Label>
        <Input id="phone" name="phone" type="tel" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cpf">CPF (opcional)</Label>
        <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Forma de pagamento</Label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
          <input type="radio" name="payment_type" value="MONTHLY" className="mt-0.5" />
          <span>
            <span className="block font-medium">
              Parcelado — 12x {formatCents(plan.monthlyPriceCents)}
            </span>
            <span className="block text-muted-foreground">
              Total: {formatCents(monthlyTotalCents)}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-input p-3 text-sm has-checked:border-secondary has-checked:bg-secondary/10">
          <input type="radio" name="payment_type" value="ANNUAL" defaultChecked className="mt-0.5" />
          <span>
            <span className="block font-medium">
              À vista — {formatCents(plan.annualPriceCents)} ⭐ mais vantajoso
            </span>
            <span className="block text-muted-foreground">
              Economia de {formatCents(annualSavingsCents)}
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_password">Confirmar senha</Label>
        <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="terms" name="terms" required className="mt-0.5" />
        <Label htmlFor="terms" className="text-xs font-normal text-muted-foreground">
          Li e aceito os{" "}
          <a href="/termos" className="underline underline-offset-2">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/politica-de-privacidade" className="underline underline-offset-2">
            política de privacidade
          </a>
          .
        </Label>
      </div>

      <Button type="submit" variant="secondary" className="mt-2">
        ASSINAR O CLUBE NEON {planType === "COMPLETO" ? "COMPLETO" : "ESSENCIAL"}
      </Button>
    </form>
  );
}
