/**
 * A CHAVE DA INSTALAÇÃO ATENDE O WORKER — inclusive quando só há `OPENAI_API_KEY`.
 *
 * O `install.sh` oferece OpenAI como provedor e a chave vai para
 * `OPENAI_API_KEY`; o catálogo (`ai_models`, migration 0104) serve o id do
 * modelo BARE (`gpt-5.6-terra`, o `is_default_for_provider` da OpenAI), sem
 * prefixo de rota; e o turno real monta o provedor pelo par (provider da
 * organização, chave do ambiente) em `buildModel`. É por isso que o ensaio do
 * agente e o "Sugerir resposta" respondem numa instalação assim.
 *
 * O worker de resposta automática não respondia. Ele resolvia o modelo por
 * `resolveLanguageModel`, que roteia pelo PREFIXO do id canônico
 * (`openai/gpt-5.6-terra`): id sem prefixo não acha provedor nenhum, o resolver
 * devolvia `null` e a mensagem do cliente era pulada com
 * `reason: "ai_gateway_key_missing"` — com a chave certa no `.env` (issue
 * #1181).
 *
 * O que este teste prende: com só `OPENAI_API_KEY`, o id do catálogo resolve no
 * provedor que a ORGANIZAÇÃO escolheu; o id que chega ao SDK é o do catálogo,
 * sem a rota (o prefixo é rota, não nome de modelo); sem chave nenhuma o
 * desfecho continua o mesmo; e id de outro provedor não passa a ser atendido
 * pela chave da OpenAI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock: Record<string, string> = {};
vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
}));

const estado = vi.hoisted(() => ({
  binding: null as Record<string, unknown> | null,
  credencial: null as Record<string, unknown> | null,
  settings: null as unknown,
  leiturasDeOrganizacao: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "organizations") estado.leiturasDeOrganizacao += 1;
      const chain = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data:
            tabela === "ai_purpose_bindings"
              ? estado.binding
              : tabela === "organizations"
                ? { settings: estado.settings }
                : estado.credencial,
        }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/crypto/aes_gcm", () => ({
  decryptKey: () => "chave-decifrada-da-organizacao",
  byteaToBuffer: (v: unknown) => v,
}));

const { resolverModeloDoPonto } = await import("@/lib/ai/gateway-binding");

const ORG = "33333333-3333-4333-8333-333333333333";
const MODELO_PADRAO_DA_OPENAI = "gpt-5.6-terra";

beforeEach(() => {
  for (const k of Object.keys(envMock)) delete envMock[k];
  estado.binding = null;
  estado.credencial = null;
  estado.settings = { llm: { provider: "openai" } };
  estado.leiturasDeOrganizacao = 0;
});

describe("o worker responde com a chave da instalação", () => {
  it("só com OPENAI_API_KEY, o id do catálogo resolve o ponto", async () => {
    envMock.OPENAI_API_KEY = "sk-openai";

    const resolvido = await resolverModeloDoPonto("bot_respond", ORG, MODELO_PADRAO_DA_OPENAI);

    expect(resolvido).not.toBeNull();
    expect(resolvido?.modelId).toBe(MODELO_PADRAO_DA_OPENAI);
    expect(resolvido?.origem).toBe("padrao");
  });

  it("o id que chega ao provedor é o do catálogo, sem a rota", async () => {
    envMock.OPENAI_API_KEY = "sk-openai";

    const resolvido = await resolverModeloDoPonto("bot_respond", ORG, MODELO_PADRAO_DA_OPENAI);
    const instanciado = resolvido?.model as { modelId?: string } | undefined;

    expect(typeof resolvido?.model).toBe("object");
    expect(instanciado?.modelId).toBe(MODELO_PADRAO_DA_OPENAI);
  });

  it("binding sem credencial utilizável também cai na chave da instalação", async () => {
    envMock.OPENAI_API_KEY = "sk-openai";
    estado.binding = {
      provider: "openai",
      credential_id: null,
      model_id: MODELO_PADRAO_DA_OPENAI,
      base_url: null,
    };

    const resolvido = await resolverModeloDoPonto("bot_respond", ORG, MODELO_PADRAO_DA_OPENAI);

    expect(resolvido).not.toBeNull();
    expect(resolvido?.origem).toBe("padrao");
  });

  it("sem chave nenhuma no ambiente o desfecho continua o mesmo", async () => {
    const resolvido = await resolverModeloDoPonto("bot_respond", ORG, MODELO_PADRAO_DA_OPENAI);

    expect(resolvido).toBeNull();
  });

  it("id de outro provedor não vira chamada com a chave da OpenAI", async () => {
    envMock.OPENAI_API_KEY = "sk-openai";

    const resolvido = await resolverModeloDoPonto(
      "bot_respond",
      ORG,
      "anthropic/claude-haiku-4-5",
    );

    expect(resolvido).toBeNull();
  });

  it("id canônico prefixado segue resolvendo — não-regressão do degrau antigo", async () => {
    envMock.OPENAI_API_KEY = "sk-openai";

    const resolvido = await resolverModeloDoPonto("bot_respond", ORG, "openai/gpt-5.6-terra");

    expect(resolvido).not.toBeNull();
    expect(resolvido?.modelId).toBe("openai/gpt-5.6-terra");
  });

  it("id prefixado não paga a leitura do provedor da organização", async () => {
    // O caminho da instalação padrão (chave Anthropic, sem credencial
    // cadastrada) roda a cada evento do worker de sentimento. A única leitura
    // de `organizations` que lhe cabe é a da procura por credencial; a do
    // provedor só serve a id BARE e seria descartada aqui.
    envMock.ANTHROPIC_API_KEY = "sk-ant";

    const resolvido = await resolverModeloDoPonto(
      "sentiment_classify",
      ORG,
      "anthropic/claude-haiku-4-5",
    );

    expect(resolvido).not.toBeNull();
    expect(estado.leiturasDeOrganizacao).toBe(1);
  });
});
