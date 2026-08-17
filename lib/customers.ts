import { onlyDigits } from "@/lib/cpf";

/**
 * Monta o filtro pro .or() do PostgREST buscando por nome, e-mail, CPF,
 * telefone ou código de membro. Remove vírgula/parênteses do input pra não
 * quebrar (ou vazar) a sintaxe do filtro.
 */
export function buildCustomerSearchFilter(rawQuery: string): string {
  const safe = rawQuery.replace(/[,()]/g, "");
  const digits = onlyDigits(rawQuery);

  const parts = [
    `name.ilike.%${safe}%`,
    `email.ilike.%${safe}%`,
    `member_number.ilike.%${safe}%`,
  ];
  parts.push(digits ? `cpf.ilike.%${digits}%` : `cpf.ilike.%${safe}%`);
  parts.push(digits ? `phone.ilike.%${digits}%` : `phone.ilike.%${safe}%`);

  return parts.join(",");
}
