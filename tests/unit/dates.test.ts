import { addMonths, formatDate, formatDateTime } from "@/lib/dates";

describe("lib/dates", () => {
  describe("formatDate", () => {
    it("formata uma data válida como DD/MM/AAAA", () => {
      // meio-dia UTC evita o dia virar por causa de fuso horário
      expect(formatDate("2026-03-15T12:00:00Z")).toBe("15/03/2026");
    });

    it("retorna '—' pra null/undefined", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
    });
  });

  describe("formatDateTime", () => {
    it("retorna '—' pra null/undefined", () => {
      expect(formatDateTime(null)).toBe("—");
    });

    it("inclui data e hora pra um valor válido", () => {
      const result = formatDateTime("2026-03-15T12:00:00Z");
      expect(result).toContain("2026");
    });
  });

  describe("addMonths", () => {
    it("soma meses dentro do mesmo ano", () => {
      const result = addMonths("2026-01-15T00:00:00", 2);
      expect(result.getMonth()).toBe(2); // março (0-indexed)
      expect(result.getFullYear()).toBe(2026);
    });

    it("vira o ano quando soma passa de dezembro", () => {
      const result = addMonths("2026-11-15T00:00:00", 3);
      expect(result.getFullYear()).toBe(2027);
      expect(result.getMonth()).toBe(1); // fevereiro
    });

    it("aceita um objeto Date além de string", () => {
      const result = addMonths(new Date(2026, 0, 1), 12);
      expect(result.getFullYear()).toBe(2027);
    });
  });
});
