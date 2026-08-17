import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(1, "Informe seu nome completo."),
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    phone: z.string().trim().min(1, "Informe seu telefone."),
    cpf: z
      .string()
      .nullable()
      .transform((v) => (v && v.trim() ? onlyDigits(v) : null))
      .refine((v) => v === null || isValidCpf(v), "CPF inválido."),
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
    confirm_password: z.string(),
    terms: z.boolean().refine((v) => v === true, {
      error: "Você precisa aceitar os termos de uso pra continuar.",
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    error: "As senhas não coincidem.",
    path: ["confirm_password"],
  });

export type CheckoutValues = z.infer<typeof checkoutSchema>;
