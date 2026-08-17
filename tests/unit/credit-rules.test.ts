import { validateDebit, applyDebit } from "@/lib/credit-rules";

describe("lib/credit-rules", () => {
  describe("validateDebit", () => {
    it("aceita débito dentro do saldo", () => {
      expect(validateDebit(9900, 6000)).toEqual({ valid: true });
    });

    it("aceita débito igual ao saldo total (zera a carteira)", () => {
      expect(validateDebit(9900, 9900)).toEqual({ valid: true });
    });

    it("rejeita débito maior que o saldo", () => {
      const result = validateDebit(5000, 6000);
      expect(result.valid).toBe(false);
    });

    it("rejeita débito de zero", () => {
      const result = validateDebit(9900, 0);
      expect(result.valid).toBe(false);
    });

    it("rejeita débito negativo", () => {
      const result = validateDebit(9900, -100);
      expect(result.valid).toBe(false);
    });
  });

  describe("applyDebit", () => {
    it("retorna o saldo após o débito", () => {
      expect(applyDebit(9900, 6000)).toBe(3900);
    });

    it("nunca deixa o saldo resultante negativo — lança em vez disso", () => {
      expect(() => applyDebit(5000, 6000)).toThrow();
    });

    it("lança pra débito de zero", () => {
      expect(() => applyDebit(9900, 0)).toThrow();
    });

    it("lança pra débito negativo", () => {
      expect(() => applyDebit(9900, -50)).toThrow();
    });
  });
});
