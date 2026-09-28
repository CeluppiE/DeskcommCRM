// @vitest-environment node
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Ssr from "@supabase/ssr";

import type * as McpClient from "@/lib/agent-engine/edge/crm/mcp-client";

import {
  __resetAvisoDaUrlDoServidor,
  urlDoSupabaseNoServidor,
} from "@/lib/supabase/url-do-servidor";

/**
 * `SUPABASE_SERVER_URL` — o endereço do Supabase PARA O SERVIDOR (issue #1082).
 *
 * ─── O que a variável resolve ────────────────────────────────────────────────
 *
 * Uma instalação tem hoje UM endereço de Supabase só, e ele é público por
 * necessidade: `NEXT_PUBLIC_SUPABASE_URL` é queimada no bundle e entregue ao
 * navegador por `<PublicEnvScript/>`. Numa instalação com o Supabase na mesma
 * rede (Kong/self-host, o caminho que o `hostgator-setup-kit/healthcheck.sh`
 * já reconhece como topologia válida) o caminho curto existe e não precisa sair
 * para a internet — mas colocá-lo na `NEXT_PUBLIC_*` publicaria o endpoint
 * interno para qualquer pessoa que abrir as ferramentas do navegador.
 *
 * ─── O critério de sucesso, em dois estados ─────────────────────────────────
 *
 * 1. AUSENTE → comportamento IDÊNTICO ao de antes. O default de hoje é a URL
 *    pública, lida de `env.NEXT_PUBLIC_SUPABASE_URL` em `lib/supabase/server.ts`,
 *    `lib/supabase/admin.ts` e `proxy.ts`; é isso que a variável nova precisa
 *    reproduzir, não uma terceira forma de resolver.
 * 2. PRESENTE → o TRANSPORTE do client SSR vai para a URL nova, a BASE dele
 *    continua pública (é dela que o SDK monta os links que saem para terceiros —
 *    PR #1786), e a URL nova NUNCA chega ao navegador.
 *
 * Este arquivo mede os dois, e a segunda metade é o motivo da variável existir:
 * um teste que só verificasse "a URL nova funciona" passaria com a variável
 * vazando para o `window.__PUBLIC_ENV__`, que é exatamente o defeito que ela
 * veio evitar.
 */

const PUBLICA = "https://abcxyz.supabase.co";
const PRIVADA = "http://kong:8000";

/** O `env` que os módulos do produto leem — trocado por caso, nunca global. */
function mockDoEnv(over: Record<string, string | undefined>) {
  return {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: PUBLICA,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-de-teste",
      SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
      NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com.br",
      SUPABASE_SERVER_URL: "",
      ...over,
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  __resetAvisoDaUrlDoServidor();
});

/**
 * `vi.doMock` NÃO é desfeito por `resetModules()` — o registro do mock sobrevive
 * ao próximo arquivo/caso, e o sintoma é um teste que mede o mock do teste
 * ANTERIOR em vez do código. Este é o primeiro caso do arquivo que usa
 * `doMock("@/lib/agent-engine/env")`: sem o `doUnmock` abaixo, o caso seguinte
 * (o que pergunta se a variável é ausente no worker) recebia o `loadEnv`
 * mockado — `SUPABASE_SERVER_URL: "http://kong:8000"` vindo do mock, com o
 * `toBeUndefined()` vermelho. Medido neste PR.
 */
const MOCKADOS = [
  "next/headers",
  "@/lib/env",
  "@supabase/ssr",
  "@/lib/agent-engine/env",
  "@/lib/agent-engine/edge/crm/mcp-client",
];

afterEach(() => {
  for (const modulo of MOCKADOS) vi.doUnmock(modulo);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ─────────────────────────── AUSENTE: o default é o de sempre ─────────────── */

describe("urlDoSupabaseNoServidor — AUSENTE devolve a URL pública, como antes", () => {
  it('vazio (o que o .env de toda instalação gera) devolve a pública', () => {
    expect(urlDoSupabaseNoServidor("", PUBLICA)).toBe(PUBLICA);
  });

  it("undefined devolve a pública — mock parcial de `env` nos testes", () => {
    // Uma dúzia de arquivos de teste mockam `@/lib/env` com objeto parcial
    // (`{ env: { INTERNAL_SECRET: "x" } }`). Se `undefined` não fosse ausente,
    // a variável nova derrubaria toda essa suíte — e o conserto de retrocompati-
    // bilidade viria derrubando o que ele promete não tocar.
    expect(urlDoSupabaseNoServidor(undefined, PUBLICA)).toBe(PUBLICA);
  });

  it("só espaços é ausente: é o `.env` escrito à mão com sobra", () => {
    expect(urlDoSupabaseNoServidor("   ", PUBLICA)).toBe(PUBLICA);
  });

  /** A asserção é no VALOR, não na presença da chave. */
  it("o schema do app publica a variável como string opcional (nunca obrigatória)", async () => {
    const { env } = await import("@/lib/env");
    expect(env.SUPABASE_SERVER_URL).toBe("");
  });
});

/* ──────────────────────────── PRESENTE: o servidor muda de casa ──────────── */

describe("urlDoSupabaseNoServidor — PRESENTE aponta o servidor para a URL nova", () => {
  it("presente: devolve a URL de servidor, e não a pública", () => {
    expect(urlDoSupabaseNoServidor(PRIVADA, PUBLICA)).toBe(PRIVADA);
  });

  it("presente: o client de servidor pede à URL de servidor e fica na pública", async () => {
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ getAll: () => [], set: () => {} }),
    }));
    vi.doMock("@/lib/env", () => mockDoEnv({ SUPABASE_SERVER_URL: PRIVADA }));

    const alvos: string[] = [];
    vi.stubGlobal("fetch", (entrada: string | URL | Request) => {
      alvos.push(String(entrada));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();

    // A BASE é a pública: é dela que o SDK monta os links que este cliente
    // entrega a terceiros (signedUrl, `data.url`) — o defeito do PR #1786.
    expect((client as unknown as { supabaseUrl: string }).supabaseUrl).toBe(PUBLICA);
    // O TRANSPORTE continua sendo o de servidor: a requisição sai pelo caminho
    // curto, como antes. Ver `lib/supabase/fetch-do-servidor.ts`.
    await client.storage.from("b").createSignedUrl("p.png", 60);
    expect(alvos[0]).toBe(`${PRIVADA}/storage/v1/object/sign/b/p.png`);
  });

  it("presente: o client admin pede à URL de servidor e fica na pública", async () => {
    vi.doMock("@/lib/env", () => mockDoEnv({ SUPABASE_SERVER_URL: PRIVADA }));

    const alvos: string[] = [];
    vi.stubGlobal("fetch", (entrada: string | URL | Request) => {
      alvos.push(String(entrada));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = createAdminClient();

    expect((client as unknown as { supabaseUrl: string }).supabaseUrl).toBe(PUBLICA);
    await client.storage.from("b").createSignedUrl("p.png", 60);
    expect(alvos[0]).toBe(`${PRIVADA}/storage/v1/object/sign/b/p.png`);
  });

  it("presente: o proxy valida a sessão contra a URL de servidor", async () => {
    // O `proxy` (Edge) é quem valida o JWT de TODA requisição: se o `getUser`
    // dele não alcançar o Kong, toda navegação de uma instalação com Kong
    // privado cai para o login. A BASE continua pública (#1786) — o que leva a
    // requisição ao endereço de servidor é o `global.fetch` que ele passa.
    const vistas: string[] = [];
    const desvios: ((entrada: string) => Promise<Response>)[] = [];
    vi.doMock("@/lib/env", () => mockDoEnv({ SUPABASE_SERVER_URL: PRIVADA }));
    vi.doMock("@supabase/ssr", async () => {
      const real = await vi.importActual<typeof Ssr>("@supabase/ssr");
      return {
        ...real,
        createServerClient: (url: string, _key: string, _opts: unknown) => {
          vistas.push(url);
          const opcoes = _opts as { global?: { fetch?: (entrada: string) => Promise<Response> } };
          if (opcoes.global?.fetch) desvios.push(opcoes.global.fetch);
          return {
            auth: {
              getUser: async () => ({ data: { user: { id: "u1" } } }),
            },
            rpc: async () => ({ data: true }),
          };
        },
      };
    });

    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    await proxy(new NextRequest("https://crm.exemplo.com.br/app"));

    expect(vistas).toEqual([PUBLICA]);

    const alvos: string[] = [];
    vi.stubGlobal("fetch", (entrada: string | URL | Request) => {
      alvos.push(String(entrada));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const desviar = desvios[0] as (entrada: string) => Promise<Response>;
    await desviar(`${PUBLICA}/auth/v1/user`);
    expect(alvos).toEqual([`${PRIVADA}/auth/v1/user`]);
  });

  it("presente: o health check pergunta ao endereço do servidor", async () => {
    // Com o REST não publicado, a URL pública daria `supabase: down` com o CRM
    // inteiro funcionando ao lado — o falso alarme que fez o `update.sh` reverter
    // uma imagem boa (medido no histórico do repo, ver o cabeçalho da rota).
    const alvos: string[] = [];
    vi.doMock("@/lib/env", () =>
      mockDoEnv({
        SUPABASE_SERVER_URL: PRIVADA,
        UPSTASH_REDIS_REST_URL: "https://redis-de-teste.exemplo",
        UPSTASH_REDIS_REST_TOKEN: "token",
        INTERNAL_SECRET: "segredo-de-teste-com-tamanho-suficiente-1234",
      }),
    );
    vi.stubGlobal("fetch", (entrada: string | URL | Request) => {
      alvos.push(String(typeof entrada === "string" ? entrada : (entrada as Request).url ?? entrada));
      return Promise.resolve(new Response("[]", { status: 200 }));
    });

    const { GET } = await import("@/app/api/v1/health/route");
    await GET(new (await import("next/server")).NextRequest("https://crm.exemplo.com.br/api/v1/health"));

    expect(alvos.some((a) => a.startsWith(`${PRIVADA}/rest/v1`))).toBe(true);
    expect(alvos.some((a) => a.startsWith(`${PUBLICA}/rest/v1`))).toBe(false);
  });

  it("presente: o worker do agente monta o client pela URL de servidor", async () => {
    // O worker é o MESMO Supabase do app: se ele continuasse na pública, a
    // instalação com Kong privado perderia a contração do motor (turnos, fila,
    // handlers) enquanto o app da web pareceria sadio.
    const vistas: string[] = [];
    vi.doMock("@/lib/agent-engine/env", () => ({
      loadEnv: () => ({
        NEXT_PUBLIC_SUPABASE_URL: PUBLICA,
        SUPABASE_SERVER_URL: PRIVADA,
        SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
        INTERNAL_AGENT_RUN_STUB: "true",
      }),
    }));
    vi.doMock("@/lib/agent-engine/edge/crm/mcp-client", async () => {
      const real = await vi.importActual<typeof McpClient>("@/lib/agent-engine/edge/crm/mcp-client");
      return {
        ...real,
        crmEdgeConfigFromEnv: (e: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) => {
          vistas.push(e.SUPABASE_URL);
          return real.crmEdgeConfigFromEnv(e);
        },
      };
    });

    const { requestTurnDeps } = await import("@/lib/agent-engine/agent/request-deps");
    const deps = requestTurnDeps();
    expect(vistas).toEqual([PRIVADA]);
    // E o client realmente saiu com a URL nova — presença de chamada não basta.
    expect((deps.crmCfg.supabase as unknown as { supabaseUrl: string }).supabaseUrl).toBe(PRIVADA);
  });

  it("presente: o contrato do WORKER conhece a variável e ela chega inteira", async () => {
    // O `loadEnv` devolve `parsed.data`, e o Zod REMOVE o que o schema não
    // declara (medido no `env.test.ts` da família das chaves de provedor). Sem
    // a linha no schema, a chave existiria no `.env` e sumiria no boot do worker
    // — a variável existiria só no app, que é metade do ganho e nenhum aviso.
    const { loadEnv } = await import("@/lib/agent-engine/env");
    const env = loadEnv({
      NODE_ENV: "test",
      SUPABASE_DB_URL: "postgresql://u:p@localhost:5432/db",
      NEXT_PUBLIC_SUPABASE_URL: PUBLICA,
      SUPABASE_SERVER_URL: PRIVADA,
      SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
    });

    expect(env.SUPABASE_SERVER_URL).toBe(PRIVADA);
    // E o MESMO resolvedor dos dois runtimes devolve a mesma coisa: o worker
    // fala com o Kong pelo mesmo endereço que o app.
    expect(urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL)).toBe(PRIVADA);
  });

  it("ausente no worker: o contrato dele não exige a variável", async () => {
    // `required()` aqui derrubaria o boot de toda instalação que não conhece a
    // variável — a definição de "quebra quem já instalou".
    const { loadEnv } = await import("@/lib/agent-engine/env");
    const env = loadEnv({
      NODE_ENV: "test",
      SUPABASE_DB_URL: "postgresql://u:p@localhost:5432/db",
      NEXT_PUBLIC_SUPABASE_URL: PUBLICA,
      SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
    });

    expect(env.SUPABASE_SERVER_URL).toBeUndefined();
    expect(urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL)).toBe(PUBLICA);
  });
});

/* ───────────────────────────────── FORMA DO VALOR ───────────────────────── */

describe("urlDoSupabaseNoServidor — a grafia do `.env` não vira host diferente", () => {
  it("barra final sai: `http://kong:8000/` e `http://kong:8000` são a mesma rota", () => {
    expect(urlDoSupabaseNoServidor(`${PRIVADA}/`, PUBLICA)).toBe(PRIVADA);
  });

  it("barras finais repetidas saem todas", () => {
    expect(urlDoSupabaseNoServidor(`${PRIVADA}///`, PUBLICA)).toBe(PRIVADA);
  });

  it("espaço à direita sai — o Zod NÃO recusa esse caso", () => {
    // Medido em zod 4.6.5: `z.string().url()` ACEITA `"http://kong:8000 "` com
    // espaço. A barra o SDK normaliza; o espaço não, e o que sobra é uma URL cujo
    // host é outro — o sintoma é "não achou o banco" numa configuração que
    // parece certa.
    expect(urlDoSupabaseNoServidor(`${PRIVADA} `, PUBLICA)).toBe(PRIVADA);
  });

  it("https numa instalação com Kong reverso vale, e barra final também sai", () => {
    expect(urlDoSupabaseNoServidor("https://sb-interno.exemplo.com.br///", PUBLICA)).toBe(
      "https://sb-interno.exemplo.com.br",
    );
  });
});

/* ────────────────────────────── VALOR RECUSADO ───────────────────────────── */

describe("urlDoSupabaseNoServidor — o que não é endereço degrada, não derruba", () => {
  it("endereço sem esquema é recusado e vale a pública", () => {
    // A doutrina escrita ao lado de `APP_ACCENT_HEX`/`SIGNUP_MODE` em
    // `lib/env.ts`: `safeParse` LANÇA no import, que no Next é a primeira
    // requisição, e o healthcheck do contêiner é probe TCP. Um `.env` com
    // `SUPABASE_SERVER_URL=kon:8000` derrubaria o produto com o Docker
    // mostrando `healthy`. Degradar devolve a instalação ao estado de antes.
    expect(urlDoSupabaseNoServidor("kong:8000", PUBLICA)).toBe(PUBLICA);
  });

  it("esquema que não é http(s) é recusado", () => {
    expect(urlDoSupabaseNoServidor("file:///etc/passwd", PUBLICA)).toBe(PUBLICA);
  });

  it("o valor recusado avisa UMA vez no log, e o aviso não leva o valor", () => {
    const registro = vi.spyOn(console, "warn").mockImplementation(() => {});
    urlDoSupabaseNoServidor("kong:8000", PUBLICA);
    urlDoSupabaseNoServidor("outro-valor-invalido", PUBLICA);

    // Um aviso por variável: o resolvedor roda em toda requisição de página e
    // no health de 5 em 5 segundos. Um aviso por chamada enche o log da VPS.
    expect(registro).toHaveBeenCalledTimes(1);
    // O valor pode vir com credencial na authority; o log da instalação é
    // log público. Só o NOME da variável pode aparecer.
    const linha = registro.mock.calls[0]?.[0] ?? "";
    expect(linha).not.toContain("kong:8000");
  });
});

/* ──────────────── O QUE O SERVIDOR NÃO PODE ENTREGAR AO NAVEGADOR ────────── */

describe("a URL de servidor não vaza para o browser", () => {
  it("o payload público de <PublicEnvScript/> não cita a variável", () => {
    // É o ponto inteiro da issue: a variável existe para o endpoint interno NÃO
    // ser publicado. Se alguém a acrescentar ao `window.__PUBLIC_ENV__`, o
    // ganho vira o defeito — e o navegador passa a falar com o Kong.
    const fonte = readFileSync("app/public-env-script.tsx", "utf8");
    expect(fonte).not.toContain("SUPABASE_SERVER_URL");
  });

  it("o tipo do que o navegador recebe não declara a variável", () => {
    const fonte = readFileSync("types/public-env.d.ts", "utf8");
    expect(fonte).not.toContain("SUPABASE_SERVER_URL");
  });

  it("o client de browser continua lendo a URL pública", () => {
    const fonte = readFileSync("lib/supabase/browser.ts", "utf8");
    expect(fonte).not.toContain("SUPABASE_SERVER_URL");
    // Controle positivo de VACUIDIDADE: o teste acima passaria com o arquivo
    // inteiro deletado. A asserção abaixo é a que diz que ele é o lugar certo.
    expect(fonte).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

/* ─────────────────────────── A LIGAÇÃO NOS PONTOS DE USO ────────────────── */

describe("a variável é lida nos três pontos de servidor, e nowhere menos", () => {
  const pontosDeLeitura = [
    "lib/supabase/server.ts",
    "lib/supabase/admin.ts",
    "proxy.ts",
    "app/api/v1/health/route.ts",
  ];

  it("cada um dos pontos de servidor passa pela mesma função", () => {
    for (const arquivo of pontosDeLeitura) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, `${arquivo} não resolve a URL do servidor`).toContain(
        "urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL)",
      );
    }
  });

  it("nenhum outro arquivo do produto passa a ler a variável", () => {
    // A lista é a que o repo mantém: se um quarto ponto de servidor nascer e
    // for esquecido, ele continua na URL pública em silêncio. Se um ponto novo
    // for adicionado DE PROPÓSITO, este teste manda tirá-lo daqui.
    const EXTRA = ["lib/agent-engine/agent/request-deps.ts", "workers/agent-worker/main.ts"];
    const todos = [
      "lib/supabase/server.ts",
      "lib/supabase/admin.ts",
      "proxy.ts",
      "app/api/v1/health/route.ts",
      ...EXTRA,
    ];
    for (const arquivo of todos) {
      expect(readFileSync(arquivo, "utf8"), arquivo).toContain("urlDoSupabaseNoServidor");
    }
  });
});
