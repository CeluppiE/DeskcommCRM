import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bindings: [] as Array<Record<string, unknown>>,
  credentials: [] as Array<Record<string, unknown>>,
  env: {
    AI_GATEWAY_API_KEY: "",
    AI_GATEWAY_BASE_URL: "",
    OPENAI_API_KEY: "",
    OPENROUTER_API_KEY: "",
    OPENROUTER_BASE_URL: "",
  },
}));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/ai/gateway", () => ({ OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1" }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: ({ ciphertext }: { ciphertext: unknown }) => ciphertext,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const rows = table === "ai_purpose_bindings" ? state.bindings : state.credentials;
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row: Record<string, unknown>) => row[column] === value);
          return query;
        },
        not: (column: string, _operator: string, value: unknown) => {
          filters.push((row: Record<string, unknown>) => row[column] !== value);
          return query;
        },
        order: async () => ({ data: rows.filter((row) => filters.every((f) => f(row))) }),
        maybeSingle: async () => ({
          data: rows.find((row) => filters.every((f) => f(row))) ?? null,
        }),
      };
      return query;
    },
  }),
}));

import { resolverChaveDeEmbedding } from "@/lib/ai/embeddings/chave";

function credential(overrides: Record<string, unknown>) {
  return {
    id: "cred-1",
    organization_id: "org-1",
    provider: "openrouter",
    label: "Chave de conhecimento",
    api_key_encrypted: "chave-ficticia-openrouter",
    api_key_iv: "iv",
    api_key_tag: "tag",
    is_active: true,
    validated_at: "2026-09-28T00:00:00Z",
    created_at: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.bindings = [];
  state.credentials = [];
  state.env.AI_GATEWAY_API_KEY = "";
  state.env.OPENAI_API_KEY = "";
  state.env.OPENROUTER_API_KEY = "";
});

describe("resolverChaveDeEmbedding", () => {
  it("credencial OpenRouter validada serve à indexação e à consulta da própria organização", async () => {
    state.credentials = [
      credential({ organization_id: "outra-org", api_key_encrypted: "chave-alheia" }),
      credential({}),
    ];

    const indexar = await resolverChaveDeEmbedding("org-1", "embedding_indexar");
    const consultar = await resolverChaveDeEmbedding("org-1", "embedding_consultar");

    for (const chave of [indexar, consultar]) {
      expect(chave).toMatchObject({
        apiKey: "chave-ficticia-openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        provedor: "openrouter",
        origem: "credencial_da_organizacao",
      });
    }
    expect(await resolverChaveDeEmbedding("outra-org")).toMatchObject({ apiKey: "chave-alheia" });
  });

  it("preserva a precedência da credencial OpenAI existente", async () => {
    state.credentials = [
      credential({}),
      credential({ id: "cred-openai", provider: "openai", api_key_encrypted: "chave-ficticia-openai" }),
    ];

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      apiKey: "chave-ficticia-openai",
      baseUrl: null,
      provedor: "openai",
    });
  });

  it("não usa credencial OpenRouter inativa ou ainda não validada", async () => {
    state.credentials = [
      credential({ is_active: false }),
      credential({ id: "cred-2", validated_at: null }),
    ];

    expect(await resolverChaveDeEmbedding("org-1")).toBeNull();
  });

  it("aceita a chave OpenRouter da instalação quando não há credencial da organização", async () => {
    state.env.OPENROUTER_API_KEY = "chave-ficticia-instalacao";

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      apiKey: "chave-ficticia-instalacao",
      baseUrl: "https://openrouter.ai/api/v1",
      provedor: "openrouter",
      origem: "chave_da_instalacao",
    });
  });

  // A chave OpenRouter da organização costuma estar ali para a CONVERSA. Se ela
  // passasse na frente da OpenAI ou do gateway da instalação, a atualização
  // trocaria em silêncio o fornecedor de quem já indexava.
  it("OPENAI_API_KEY da instalação vence a credencial OpenRouter da organização", async () => {
    state.env.OPENAI_API_KEY = "chave-ficticia-env-openai";
    state.credentials = [credential({})];

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      apiKey: "chave-ficticia-env-openai",
      provedor: "openai",
      origem: "chave_da_instalacao",
    });
  });

  it("o gateway da instalação vence a credencial OpenRouter da organização", async () => {
    state.env.AI_GATEWAY_API_KEY = "gateway-ficticio";
    state.credentials = [credential({})];

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      provedor: "gateway",
      origem: "gateway_da_instalacao",
    });
  });

  it("a credencial OpenRouter da organização vence a OPENROUTER_API_KEY da instalação", async () => {
    state.env.OPENROUTER_API_KEY = "chave-ficticia-instalacao";
    state.credentials = [credential({})];

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      apiKey: "chave-ficticia-openrouter",
      origem: "credencial_da_organizacao",
    });
  });

  it("binding explícito de OpenRouter usa a própria credencial e o modelo permanece fixo", async () => {
    state.bindings = [
      {
        organization_id: "org-1",
        purpose: "embedding_indexar",
        is_enabled: true,
        credential_id: "cred-1",
        model_id: "openai/text-embedding-3-small",
        base_url: null,
      },
    ];
    state.credentials = [credential({})];

    expect(await resolverChaveDeEmbedding("org-1")).toMatchObject({
      provedor: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      origem: "binding_do_ponto",
    });
  });
});
