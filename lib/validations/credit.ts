import { z } from "zod";

export const creditAdjustmentSchema = z.object({
  amount_reais: z.coerce
    .number({ error: "Informe um valor válido." })
    .refine((v) => v !== 0, "O ajuste não pode ser zero."),
  reason: z.string().trim().min(1, "Informe o motivo do ajuste."),
});

export type CreditAdjustmentValues = z.infer<typeof creditAdjustmentSchema>;
