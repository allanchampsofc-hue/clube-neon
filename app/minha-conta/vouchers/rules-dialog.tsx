"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VOUCHER_TYPE_LABELS, type VoucherType } from "@/lib/vouchers";

export function RulesDialog({ voucherType, rules }: { voucherType: VoucherType; rules: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="self-start text-muted-foreground" />}
      >
        Ver regras de uso
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{VOUCHER_TYPE_LABELS[voucherType]} — regras de uso</DialogTitle>
          <DialogDescription>{rules}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
