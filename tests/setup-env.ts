// Carrega .env.test (se existir) antes da suíte rodar. Parser manual — sem
// dependência nova só pra isso. Testes unitários não leem nada daqui (não
// importam nada que use essas variáveis), então rodam igual sem .env.test.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(__dirname, "..", ".env.test");

if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
