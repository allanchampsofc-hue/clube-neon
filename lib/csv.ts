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

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
