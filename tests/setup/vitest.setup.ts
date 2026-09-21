import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Remove um par de aspas (simples ou duplas) que envolva o valor inteiro —
 * mesma convenção que `hostgator-setup-kit/install.sh` grava no `.env` de
 * TODA instalação self-host (`NEXT_PUBLIC_APP_URL="https://${DOMAIN}"`).
 * Sem isto, um self-hoster que rode `pnpm test:unit` na própria VPS antes de
 * atualizar vê a suíte inteira falhar com "Variáveis de ambiente inválidas"
 * (a URL vira `"https://…"` — aspas incluídas — e falha a validação Zod de
 * `lib/env.ts`), mesmo com o `.env` real e correto. `.env.example` (o
 * convívio local, sem instalador) não usa aspas — por isso o bug nunca
 * apareceu em desenvolvimento, só em VPS instalada pelo kit.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

// Load .env and .env.local before importing any app code that validates env vars
for (const envFile of [".env", ".env.local"]) {
  try {
    const path = resolve(process.cwd(), envFile);
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key && !process.env[key]) {
        process.env[key] = stripQuotes(rest.join("=").trim());
      }
    }
  } catch {
    // File doesn't exist, skip
  }
}

/**
 * Placeholders para as vars que `lib/env.ts` exige na IMPORTAÇÃO.
 *
 * Sem isto, qualquer arquivo de teste que importe (mesmo transitivamente) um
 * módulo que toque `@/lib/env` **não carrega** onde não há `.env` — e o CI é
 * exatamente esse lugar. O sintoma é cruel: some o arquivo inteiro em vez de
 * falhar um teste, então a contagem cai e ninguém vê que a cobertura evaporou.
 * Foi o que aconteceu no PR #58: 4 arquivos com 0 testes rodados, e o número
 * verde de 1322 escondendo que 3 deles eram novos.
 *
 * É o mesmo remédio que `lib/env.ts:155` já aplica na fase de build da imagem
 * ("semeia placeholders pras vars que faltam e revalida"), aqui restrito ao
 * setup de teste — a lógica de produção não é tocada.
 *
 * `??=` de propósito: valor real de `.env`/`.env.local` SEMPRE vence, então
 * localmente nada muda. E o host `.invalid` é reservado por RFC 2606: se algum
 * teste tentar usar isto como URL de verdade, a chamada falha alto em vez de
 * bater em algum lugar existente.
 */
const PLACEHOLDERS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://test-placeholder.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-placeholder-service-role-key",
};
for (const [chave, valor] of Object.entries(PLACEHOLDERS)) {
  process.env[chave] ??= valor;
}

import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver; Radix (ex.: Switch) usa em layout effects.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * O timer que o Radix deixa para trás não pode disparar em outro jsdom.
 *
 * Ao desmontar, o `FocusScope` do Radix (Dialog, Popover, Sheet…) agenda um
 * `setTimeout(0)` que faz `new CustomEvent(...)` e `container.dispatchEvent`.
 * Quando o componente é desmontado pela limpeza do ÚLTIMO teste de um arquivo,
 * esse timer pode disparar depois que o ambiente jsdom do arquivo já foi
 * desfeito: o evento nasce de outro `window` e o jsdom recusa com
 * "Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of
 * type 'Event'". O vitest conta isso como erro não tratado e reprova a suíte
 * com todos os arquivos verdes — medido no `verify` do #1163 (run
 * 35336406831), atribuído a `composer-colar-imagem.test.tsx`, e intermitente
 * porque depende do relógio do runner.
 *
 * O conserto é dar ao timer a vez de rodar ENQUANTO o jsdom do arquivo existe:
 * desmonta explicitamente e espera um tique de macrotarefa. Com relógio falso
 * ligado não há o que esperar (o timer também é falso) — e esperar um
 * `setTimeout` falso travaria o hook até o teto do teste.
 */
if (typeof document !== "undefined") {
  const { afterEach, vi } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(async () => {
    cleanup();
    if (vi.isFakeTimers()) return;
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}
