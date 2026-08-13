import { z } from "zod";

export const planFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do plano."),
  price_reais: z.coerce
    .number({ error: "Informe um valor válido." })
    .nonnegative("O valor não pode ser negativo."),
  monthly_credit_reais: z.coerce
    .number({ error: "Informe um valor válido." })
    .nonnegative("O crédito não pode ser negativo."),
  duration_months: z.coerce
    .number({ error: "Informe um número de meses válido." })
    .int("Duração precisa ser um número inteiro de meses.")
    .positive("Duração precisa ser de pelo menos 1 mês."),
  grace_period_months: z.coerce
    .number({ error: "Informe um número de meses válido." })
    .int("O período de carência precisa ser um número inteiro de meses.")
    .nonnegative("O período de carência não pode ser negativo."),
  active: z.coerce.boolean(),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;

/** Converte reais (ex: 49.9) pra centavos (ex: 4990), arredondando pra evitar erro de ponto flutuante. */
export function reaisToCents(reais: number) {
  return Math.round(reais * 100);
}
