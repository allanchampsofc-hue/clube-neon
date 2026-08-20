"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { requestCancellation } from "./actions";

export function CancelSubscriptionDialog({
  paymentType,
  monthlyPriceCents,
}: {
  paymentType: "MONTHLY" | "ANNUAL";
  monthlyPriceCents: number;
}) {
  const penaltyCents = monthlyPriceCents * 3;
  const penaltyReais = (penaltyCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
        Cancelar assinatura
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar assinatura</DialogTitle>
          <DialogDescription>
            {paymentType === "ANNUAL"
              ? `Como seu plano foi contratado à vista, não há novas cobranças a cancelar. Ao confirmar, você mantém acesso ao seu crédito mensal normalmente até o fim dos 12 meses contratados. Não há reembolso do valor já pago.`
              : `Ao confirmar o cancelamento, você será cobrado pelos próximos 3 meses (${penaltyReais}) e continuará tendo acesso ao seu crédito mensal nesses períodos. Após esse prazo, sua participação no Clube Neon será encerrada sem novas cobranças.`}
          </DialogDescription>
        </DialogHeader>
        <form action={requestCancellation} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Motivo (opcional)</Label>
            <Textarea id="reason" name="reason" rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive">
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
