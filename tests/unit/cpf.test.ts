import { formatCpf, maskCpf, isValidCpf, onlyDigits } from "@/lib/cpf";

describe("lib/cpf", () => {
  describe("maskCpf", () => {
    it("mascara um CPF válido mantendo os 3 primeiros e 2 últimos dígitos", () => {
      expect(maskCpf("11144477735")).toBe("111.***.***-35");
    });

    it("mascara um CPF formatado (com pontuação) do mesmo jeito", () => {
      expect(maskCpf("111.444.777-35")).toBe("111.***.***-35");
    });

    it("retorna 'Não informado' pra null", () => {
      expect(maskCpf(null)).toBe("Não informado");
    });

    it("retorna 'Não informado' pra undefined", () => {
      expect(maskCpf(undefined)).toBe("Não informado");
    });
  });

  describe("formatCpf", () => {
    it("formata um CPF válido com pontuação", () => {
      expect(formatCpf("11144477735")).toBe("111.444.777-35");
    });

    it("retorna 'Não informado' pra null/undefined", () => {
      expect(formatCpf(null)).toBe("Não informado");
      expect(formatCpf(undefined)).toBe("Não informado");
    });
  });

  describe("isValidCpf", () => {
    it("aceita um CPF válido conhecido", () => {
      expect(isValidCpf("111.444.777-35")).toBe(true);
    });

    it("rejeita dígito verificador errado", () => {
      expect(isValidCpf("111.444.777-36")).toBe(false);
    });

    it("rejeita CPF com todos os dígitos iguais", () => {
      expect(isValidCpf("111.111.111-11")).toBe(false);
    });

    it("rejeita tamanho errado", () => {
      expect(isValidCpf("123")).toBe(false);
    });

    it("rejeita null/undefined sem lançar", () => {
      expect(isValidCpf(null)).toBe(false);
      expect(isValidCpf(undefined)).toBe(false);
    });
  });

  describe("onlyDigits", () => {
    it("remove tudo que não é dígito", () => {
      expect(onlyDigits("111.444.777-35")).toBe("11144477735");
    });

    it("retorna string vazia pra null/undefined", () => {
      expect(onlyDigits(null)).toBe("");
      expect(onlyDigits(undefined)).toBe("");
    });
  });
});
