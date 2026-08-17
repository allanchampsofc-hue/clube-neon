import { z } from "zod";

export const creditAdjustmentSchema = z.object({
  amount_reais: z.coerce
    .number({ error: "Informe um valor válido." })
    .refine((v) => v !== 0, "O ajuste não pode ser zero."),
  reason: z.string().trim().min(1, "Informe o motivo do ajuste."),
});

export type CreditAdjustmentValues = z.infer<typeof creditAdjustmentSchema>;

export const advancedCreditAdjustmentSchema = z.object({
  type: z.enum(["BONUS", "AJUSTE_MANUAL", "ESTORNO"], {
    error: "Selecione um tipo de lançamento.",
  }),
  amount_reais: z.coerce
    .number({ error: "Informe um valor válido." })
    .refine((v) => v !== 0, "O valor não pode ser zero."),
  reason: z.string().trim().min(1, "Informe o motivo do lançamento."),
});

export type AdvancedCreditAdjustmentValues = z.infer<
  typeof advancedCreditAdjustmentSchema
>;
