import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Server Actions usam essas duas APIs do Next, que só funcionam dentro
    // do runtime real (request scope). Nos testes de integração, um
    // cookie-jar em memória e uma captura de redirect substituem isso —
    // o Supabase em si nunca é mockado, só a camada do framework.
    "^next/headers$": "<rootDir>/tests/mocks/next-headers.ts",
    "^next/navigation$": "<rootDir>/tests/mocks/next-navigation.ts",
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
};

export default config;
