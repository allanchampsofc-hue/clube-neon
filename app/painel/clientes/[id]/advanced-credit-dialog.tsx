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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adjustCreditAdvanced } from "../credit-actions";

export function AdvancedCreditDialog({ customerId }: { customerId: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" size="sm" />}>
        Ajuste avançado
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste avançado de crédito</DialogTitle>
          <DialogDescription>
            Bônus, ajuste manual ou estorno — só ADMIN e SUPER_ADMIN, fica
            registrado na auditoria.
          </DialogDescription>
        </DialogHeader>
        <form
          action={adjustCreditAdvanced.bind(null, customerId)}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipo</Label>
            <Select name="type" defaultValue="BONUS">
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BONUS">Bônus</SelectItem>
                <SelectItem value="AJUSTE_MANUAL">Ajuste manual</SelectItem>
                <SelectItem value="ESTORNO">Estorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv_amount_reais">
              Valor (R$, use negativo pra debitar)
            </Label>
            <Input
              id="adv_amount_reais"
              name="amount_reais"
              type="number"
              step="0.01"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adv_reason">Motivo</Label>
            <Input id="adv_reason" name="reason" required />
          </div>
          <DialogFooter>
            <Button type="submit">Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
