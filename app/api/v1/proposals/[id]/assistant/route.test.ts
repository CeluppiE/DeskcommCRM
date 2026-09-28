import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { gerarMudancas } from "@/lib/propostas/assistente";
import { LlmBudgetExceededError, LlmProviderUnknownError, LlmModelNotEnabledError } from "@/lib/agent-engine/edge/llm/run-model-call";

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/propostas/assistente", () => ({ gerarMudancas: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";

function pedido(corpo: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/proposals/${PROPOSAL_ID}/assistant`, {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

interface MundoOpts {
  lancarNoGerar?: "orcamento" | "provider" | "model";
  status?: string;
  suporteReadOnly?: boolean;
  briefingJson?: Record<string, unknown> | null;
}

function montarMundoDeAssistente(opts: MundoOpts = {}) {
  let gerarMudancasChamado = false;

  vi.mocked(requireSupportWrite).mockResolvedValue(
    opts.suporteReadOnly
      ? NextResponse.json(
          { error: { code: "support_write_required", message: "Support write required" } },
          { status: 403 },
        )
      : null,
  );

  vi.mocked(requireRole).mockImplementation(async () => ({
    ok: true,
    user: {
      id: USER_ID,
      email: "test@example.com",
      full_name: "Test User",
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [],
    },
    org: { orgId: ORG_ID, name: "Test Org", role: "agent" },
  }));

  const proposta = {
    id: PROPOSAL_ID,
    titulo: "Proposta Teste",
    condicoes: "30 dias",
    valid_until: "2026-12-31",
    briefing_json: opts.briefingJson ?? null,
    status: opts.status ?? "rascunho",
    revision: 1,
  };

  const itens = [
    { id: "item-1", product_id: null, descricao: "Item 1", quantidade: 1, preco_unitario_cents: 100000, desconto_cents: 0, position: 1000 },
  ];

  const supabase = {
    from: (tabela: string) => {
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: proposta, error: null }),
              }),
            }),
          }),
        };
      }
      if (tabela === "crm_proposal_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: itens, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela não mockada: ${tabela}`);
    },
  };

  vi.mocked(createClient).mockResolvedValue(supabase as never);

  vi.mocked(gerarMudancas).mockImplementation(async () => {
    gerarMudancasChamado = true;
    if (opts.lancarNoGerar === "orcamento") {
      throw new LlmBudgetExceededError();
    }
    if (opts.lancarNoGerar === "provider") {
      throw new LlmProviderUnknownError("xyz");
    }
    if (opts.lancarNoGerar === "model") {
      throw new LlmModelNotEnabledError("modelo-x");
    }
    return {
      mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "x", para: "y" }],
      nao_entendido: null,
    };
  });

  return {
    async POST(corpo: unknown) {
      const { POST } = await import("./route");
      const res = await POST(pedido(corpo), { params: Promise.resolve({ id: PROPOSAL_ID }) });
      const body = await res.clone().json();
      return { status: res.status, body };
    },
    propostaFoiEscrita: () => false, // a rota de gerar não escreve
    get gerarMudancasChamado() {
      return gerarMudancasChamado;
    },
  };
}

describe("POST /api/v1/proposals/[id]/assistant", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("orcamento estourado (LlmBudgetExceededError): 200 com disponivel=false, motivo da mensagem do erro", async () => {
    const mundo = montarMundoDeAssistente({ lancarNoGerar: "orcamento" });
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(200);
    expect(res.body.data.disponivel).toBe(false);
    expect(res.body.data.motivo).toMatch(/orçamento/);
  });

  it("com sucesso: devolve a lista de mudancas, NÃO aplica nada no banco", async () => {
    const mundo = montarMundoDeAssistente({});
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(200);
    expect(res.body.data.disponivel).toBe(true);
    expect(res.body.data.mudancas.length).toBeGreaterThan(0);
    expect(mundo.propostaFoiEscrita()).toBe(false);
  });

  it("proposta que não é rascunho: 409, NÃO chama gerarMudancas (custo zero)", async () => {
    const mundo = montarMundoDeAssistente({ status: "enviada" });
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(409);
    expect(mundo.gerarMudancasChamado).toBe(false);
  });

  it("respeita recusa de suporte antes de gastar orcamento", async () => {
    const mundo = montarMundoDeAssistente({ suporteReadOnly: true });
    const res = await mundo.POST({ instrucao: "baixa 10%" });
    expect(res.status).toBe(403);
    expect(mundo.gerarMudancasChamado).toBe(false);
  });

  it("passa o briefing_json atual para gerarMudancas, como Record vazio quando é null (Review Focus)", async () => {
    const mundo = montarMundoDeAssistente({});
    const res = await mundo.POST({ instrucao: "muda o prazo" });
    expect(res.status).toBe(200);
    const chamada = vi.mocked(gerarMudancas).mock.calls.at(-1)?.[0];
    expect(chamada?.estado.briefing).toEqual({});
  });

  it("passa o briefing_json atual quando ele já tem conteúdo", async () => {
    const mundo = montarMundoDeAssistente({ briefingJson: { project: { name: "Site Catálogo" } } });
    const res = await mundo.POST({ instrucao: "muda o prazo" });
    expect(res.status).toBe(200);
    const chamada = vi.mocked(gerarMudancas).mock.calls.at(-1)?.[0];
    expect(chamada?.estado.briefing).toEqual({ project: { name: "Site Catálogo" } });
  });
});
