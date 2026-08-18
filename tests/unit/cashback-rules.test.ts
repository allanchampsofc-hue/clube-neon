import { calculateCashback } from "@/lib/cashback-rules";

describe("lib/cashback-rules", () => {
  describe("calculateCashback", () => {
    it("calcula o percentual do valor extra gasto", () => {
      expect(calculateCashback(6000, 5, 1500)).toBe(300);
    });

    it("respeita o teto máximo", () => {
      expect(calculateCashback(100000, 5, 1500)).toBe(1500);
    });

    it("retorna 0 pra valor extra zero ou negativo", () => {
      expect(calculateCashback(0, 5, 1500)).toBe(0);
      expect(calculateCashback(-100, 5, 1500)).toBe(0);
    });

    it("retorna 0 pra percentual zero", () => {
      expect(calculateCashback(6000, 0, 1500)).toBe(0);
    });

    it("arredonda pro centavo mais próximo", () => {
      expect(calculateCashback(3333, 5, 1500)).toBe(167);
    });
  });
});
