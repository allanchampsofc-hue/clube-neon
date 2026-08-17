export function onlyDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function calcCheckDigit(cpf: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += parseInt(cpf[i], 10) * (length + 1 - i);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit1 = calcCheckDigit(cpf, 9);
  const digit2 = calcCheckDigit(cpf, 10);

  return digit1 === parseInt(cpf[9], 10) && digit2 === parseInt(cpf[10], 10);
}

export function formatCpf(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/** CPF com os 6 dígitos do meio mascarados, pra exibição em resumos. */
export function maskCpf(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}
