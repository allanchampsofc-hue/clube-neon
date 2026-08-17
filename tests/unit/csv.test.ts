import { generateCsv, csvEscape, buildCsv } from "@/lib/csv";

const BOM = "﻿";

describe("lib/csv", () => {
  describe("csvEscape", () => {
    it("envolve em aspas valor com vírgula", () => {
      expect(csvEscape("Neon, Pizzaria")).toBe('"Neon, Pizzaria"');
    });

    it("duplica aspas internas", () => {
      expect(csvEscape('Diga "oi"')).toBe('"Diga ""oi"""');
    });

    it("não mexe em valor simples", () => {
      expect(csvEscape("Clube Neon")).toBe("Clube Neon");
    });
  });

  describe("buildCsv", () => {
    it("junta header e linhas com BOM UTF-8 na frente", () => {
      const csv = buildCsv(["Nome", "Valor"], [["Ana", "10"]]);
      expect(csv).toBe(`${BOM}Nome,Valor\nAna,10`);
    });
  });

  describe("generateCsv", () => {
    it("gera CSV correto a partir de um array de objetos", () => {
      const csv = generateCsv([
        { nome: "Ana", valor: 10 },
        { nome: "Bia", valor: 20 },
      ]);
      expect(csv).toBe(`${BOM}nome,valor\nAna,10\nBia,20`);
    });

    it("com array vazio (e headers explícitos) retorna só o header", () => {
      const csv = generateCsv([], ["nome", "valor"]);
      expect(csv).toBe(`${BOM}nome,valor`);
    });

    it("escapa valores com vírgula", () => {
      const csv = generateCsv([{ nome: "Neon, Pizzaria", valor: 1 }]);
      expect(csv).toBe(`${BOM}nome,valor\n"Neon, Pizzaria",1`);
    });

    it("trata null/undefined como célula vazia", () => {
      const csv = generateCsv([{ nome: "Ana", observacao: null }]);
      expect(csv).toBe(`${BOM}nome,observacao\nAna,`);
    });
  });
});
