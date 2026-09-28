import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { montarDocumentoDaProposta } from "@/lib/propostas/documento/documento-da-proposta";
import { sugerirValoresDaConversa } from "@/lib/propostas/preencher-com-conversa";
import { LlmBudgetExceededError } from "@/lib/agent-engine/edge/llm/run-model-call";

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/propostas/documento/documento-da-proposta", () => ({ montarDocumentoDaProposta: vi.fn() }));
vi.mock("@/lib/propostas/preencher-com-conversa", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/propostas/preencher-com-conversa")>();
  return { ...real, sugerirValoresDaConversa: vi.fn() };
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";

function pedido(): NextRequest {
  return new NextRequest(`http://localhost/api/v1/proposals/${PROPOSAL_ID}/preencher-com-conversa`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });
}

interface CampoFaltandoMock {
  caminho: string;
  rotulo: string;
  onde: string;
}

interface MundoOpts {
  suporteReadOnly?: boolean;
  proposta?: Record<string, unknown> | null;
  camposFaltando?: CampoFaltandoMock[] | null;
  lancarNoSugerir?: "orcamento";
  sugestao?: Array<{ campo: string; rotulo: string; valor: string }>;
}

function montarMundo(opts: MundoOpts = {}) {
  let sugerirChamado = false;
  let mensagensConsultadas = false;
  let documentoMontado = false;
  let camposRecebidos: Array<{ caminho: string; rotulo: string }> | null = null;

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
    org: { orgId: ORG_ID, name: "Test Org", role: "manager" },
  }));

  const proposta = opts.proposta === undefined
    ? {
      id: PROPOSAL_ID,
      status: "rascunho",
      template_slug: "modelo-a",
      conversation_id: "44444444-4444-4444-8444-444444444444",
      contact_id: null,
    }
    : opts.proposta;

  const mensagens = [
    { direction: "inbound", body: "Quero um site para gerar contato de comprador" },
    { direction: "outbound", body: "Claro! Vamos montar a proposta." },
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
      if (tabela === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (tabela === "messages") {
        mensagensConsultadas = true;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: async () => ({ data: mensagens, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela não mockada: ${tabela}`);
    },
  };

  vi.mocked(createAdminClient).mockReturnValue(supabase as never);

  vi.mocked(montarDocumentoDaProposta).mockImplementation(async () => {
    documentoMontado = true;
    if (opts.camposFaltando === undefined) {
      return { camposFaltando: [{ caminho: "project.objective", rotulo: "Objetivo do projeto", onde: "briefing", secoes: [] }] } as never;
    }
    if (opts.camposFaltando === null) return null;
    return { camposFaltando: opts.camposFaltando } as never;
  });

  vi.mocked(sugerirValoresDaConversa).mockImplementation(async (input) => {
    sugerirChamado = true;
    camposRecebidos = input.campos;
    if (opts.lancarNoSugerir === "orcamento") {
      throw new LlmBudgetExceededError();
    }
    return opts.sugestao ?? [];
  });

  return {
    async POST() {
      const { POST } = await import("./route");
      const res = await POST(pedido(), { params: Promise.resolve({ id: PROPOSAL_ID }) });
      const body = await res.clone().json();
      return { status: res.status, body };
    },
    get sugerirChamado() {
      return sugerirChamado;
    },
    get mensagensConsultadas() {
      return mensagensConsultadas;
    },
    get documentoMontado() {
      return documentoMontado;
    },
    get camposRecebidos() {
      return camposRecebidos;
    },
  };
}

describe("POST /api/v1/proposals/[id]/preencher-com-conversa", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("suporte só-leitura: 403, nunca lê proposta nem chama IA", async () => {
    const mundo = montarMundo({ suporteReadOnly: true });
    const res = await mundo.POST();
    expect(res.status).toBe(403);
    expect(mundo.documentoMontado).toBe(false);
    expect(mundo.sugerirChamado).toBe(false);
  });

  it("proposta não encontrada: 404", async () => {
    const mundo = montarMundo({ proposta: null });
    const res = await mundo.POST();
    expect(res.status).toBe(404);
    expect(mundo.sugerirChamado).toBe(false);
  });

  it("proposta que não é rascunho: 409 proposal_context_stale, sem chamar a IA", async () => {
    const mundo = montarMundo({
      proposta: { id: PROPOSAL_ID, status: "enviada", template_slug: "modelo-a", conversation_id: "conv-1", contact_id: null },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("proposal_context_stale");
    expect(mundo.sugerirChamado).toBe(false);
  });

  it("proposta sem template_slug (documento não montado): sugestoes [], sem chamar a IA", async () => {
    const mundo = montarMundo({
      proposta: { id: PROPOSAL_ID, status: "rascunho", template_slug: null, conversation_id: "conv-1", contact_id: null },
      camposFaltando: null,
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ disponivel: true, motivo: null, sugestoes: [] });
    expect(mundo.sugerirChamado).toBe(false);
  });

  it("só falta campo onde !== briefing (ex.: prazo): sugestoes [], sem chamar a IA", async () => {
    const mundo = montarMundo({
      camposFaltando: [{ caminho: "terms.deadline_days", rotulo: "Prazo", onde: "prazo" }],
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ disponivel: true, motivo: null, sugestoes: [] });
    expect(mundo.sugerirChamado).toBe(false);
    expect(mundo.mensagensConsultadas).toBe(false);
  });

  it("proposta sem conversation_id: sugestoes [], sem consultar messages nem chamar a IA", async () => {
    const mundo = montarMundo({
      proposta: { id: PROPOSAL_ID, status: "rascunho", template_slug: "modelo-a", conversation_id: null, contact_id: null },
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ disponivel: true, motivo: null, sugestoes: [] });
    expect(mundo.mensagensConsultadas).toBe(false);
    expect(mundo.sugerirChamado).toBe(false);
  });

  it("caminho feliz: recebe só os campos de briefing e devolve a sugestão", async () => {
    const mundo = montarMundo({
      sugestao: [{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Gerar contato de comprador" }],
    });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      disponivel: true,
      motivo: null,
      sugestoes: [{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Gerar contato de comprador" }],
    });
    expect(mundo.camposRecebidos).toEqual([{ caminho: "project.objective", rotulo: "Objetivo do projeto" }]);
  });

  it("orçamento estourado (LlmBudgetExceededError): 200 com disponivel=false, motivo da mensagem do erro", async () => {
    const mundo = montarMundo({ lancarNoSugerir: "orcamento" });
    const res = await mundo.POST();
    expect(res.status).toBe(200);
    expect(res.body.data.disponivel).toBe(false);
    expect(res.body.data.motivo).toMatch(/orçamento/);
    expect(res.body.data.sugestoes).toEqual([]);
  });
});
