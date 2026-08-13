import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .nullable(),
  phone: z.string().trim().nullable(),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine((v) => isValidCpf(v), "CPF inválido."),
  birth_date: z.string().trim().nullable(),
  active: z.coerce.boolean(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
