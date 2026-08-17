export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Monta o CSV com BOM UTF-8 (necessário pro Excel abrir acentuação certo). */
export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header.join(","), ...rows.map((row) => row.join(","))];
  return "﻿" + lines.join("\n");
}

/**
 * Monta o CSV a partir de um array de objetos — infere as colunas das
 * chaves do primeiro objeto, ou usa `headers` explicitamente (necessário
 * pra array vazio, já que aí não tem objeto nenhum pra inferir chave).
 */
export function generateCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers?: string[],
): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const csvRows = rows.map((row) =>
    cols.map((col) => csvEscape(row[col] == null ? "" : String(row[col]))),
  );
  return buildCsv(cols, csvRows);
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
