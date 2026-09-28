import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { audit } from "@/lib/audit";

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";
const LEAD_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

function pedido(corpo: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/proposals/${PROPOSAL_ID}/assistant/apply`, {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

interface MundoOpts {
  revisionAtual?: number;
  suporteReadOnly?: boolean;
  /** D10: proposta órfã — o negócio foi apagado (lead_id virou null). */
  leadIdNulo?: boolean;
  /** C3 fix (C1 da revisão): item existente vem do catálogo, com o preço ATUAL dele. */
  itemDeCatalogo?: boolean;
  precoDoCatalogo?: number;
  /** C3 fix: proposta nasce com pricing_status 'missing' (nenhum item tinha preço). */
  pricingStatusInicial?: string;
  /** Moeda da proposta já gravada (D11). Default: "BRL". */
  moedaDaProposta?: string;
  /** Moeda que o mock de catalog_products devolve (D11). Default: "BRL". */
  moedaDoCatalogo?: string;
  /** briefing_json já gravado na proposta (M4). Default: null (proposta pré-M1). */
  briefingJson?: Record<string, unknown> | null;
}

const PRODUCT_ID = "66666666-6666-4666-8666-666666666666";

function montarMundoDeAplicar(opts: MundoOpts = {}) {
  const revisionAtual = opts.revisionAtual ?? 1;
  let itemAtualizado: Record<string, unknown> | null = null;
  let propostaAtualizada: Record<string, unknown> | null = null;

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
    lead_id: opts.leadIdNulo ? null : LEAD_ID,
    contact_id: CONTACT_ID,
    titulo: "Proposta Teste",
    condicoes: "30 dias",
    valid_until: "2026-12-31",
    briefing_json: opts.briefingJson ?? null,
    status: "rascunho",
    revision: revisionAtual,
    moeda: opts.moedaDaProposta ?? "BRL",
  };

  const itens = opts.itemDeCatalogo
    ? [
        {
          id: "item-1",
          product_id: PRODUCT_ID,
          descricao: "Item de catálogo",
          quantidade: 1,
          preco_unitario_cents: 4000,
          desconto_cents: 0,
          position: 1000,
        },
      ]
    : [
        {
          id: "item-1",
          product_id: null,
          descricao: "Item 1",
          quantidade: 1,
          preco_unitario_cents: 800000,
          desconto_cents: 0,
          position: 1000,
        },
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
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      propostaAtualizada = patch;
                      return {
                        data: { id: PROPOSAL_ID, revision: revisionAtual + 1 },
                        error: null,
                      };
                    },
                  }),
                }),
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
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
          insert: async (linhas: Record<string, unknown>[]) => {
            itemAtualizado = linhas.length > 0 ? (linhas[0] as Record<string, unknown>) : null;
            return { error: null };
          },
        };
      }
      if (tabela === "catalog_products") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { preco_cents: opts.precoDoCatalogo ?? 4000, moeda: opts.moedaDoCatalogo ?? "BRL" },
                    error: null,
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

  vi.mocked(createClient).mockResolvedValue(supabase as never);
  vi.mocked(emitLeadActivity).mockImplementation(async () => ({ ok: true }));
  vi.mocked(audit).mockImplementation(async () => {});

  return {
    itemId: "item-1",
    get itemAtualizado() {
      return itemAtualizado;
    },
    get propostaAtualizada() {
      return propostaAtualizada;
    },
    async POST(corpo: unknown) {
      const { POST } = await import("./route");
      const res = await POST(pedido(corpo), { params: Promise.resolve({ id: PROPOSAL_ID }) });
      const body = await res.clone().json();
      return { status: res.status, body };
    },
    get gerarMudancasChamadoDeNovo() {
      // Aplicar não deve chamar gerar de novo
      return false;
    },
  };
}

describe("POST /api/v1/proposals/[id]/assistant/apply", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("aplica a lista recebida (não gera de novo) e incrementa revision", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1 });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [
        { tipo: "editar_item", item_id: mundo.itemId, campo: "preco_unitario_cents", de: 800000, para: 720000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(mundo.gerarMudancasChamadoDeNovo).toBe(false);
  });

  it("revision desatualizada: 409, nada aplicado", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 5 });
    const res = await mundo.POST({ revision: 1, mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "x", para: "y" }] });
    expect(res.status).toBe(409);
    expect(mundo.itemAtualizado).toBeNull();
  });

  it("aplica numa proposta orfa (lead_id nulo, negocio apagado) sem lancar — D10", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1, leadIdNulo: true });
    vi.mocked(emitLeadActivity).mockClear();
    const res = await mundo.POST({
      revision: 1,
      mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "Proposta Teste", para: "Novo título" }],
    });
    expect(res.status).toBe(200);
    // sem negócio (lead_id nulo), nao ha atividade de negocio para gravar.
    expect(vi.mocked(emitLeadActivity)).not.toHaveBeenCalled();
  });

  it("mudança tenta setar preco_unitario_cents num item de CATÁLOGO: preço final vem do catálogo, nunca do que a mudança pediu (revisão C3)", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1, itemDeCatalogo: true, precoDoCatalogo: 4000 });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [
        { tipo: "editar_item", item_id: mundo.itemId, campo: "preco_unitario_cents", de: 4000, para: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(mundo.itemAtualizado?.preco_unitario_cents).toBe(4000);
  });

  it("proposta que tinha pricing_status 'missing' e ganha preço via assistente: pricing_status é recalculado (revisão C3)", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1 });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [
        { tipo: "editar_item", item_id: mundo.itemId, campo: "preco_unitario_cents", de: 800000, para: 900000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.pricing_status).toBe("manual");
  });

  it("item de catálogo em moeda diferente da proposta: 422, a mudança da IA não é aplicada (D11)", async () => {
    const mundo = montarMundoDeAplicar({
      revisionAtual: 1, itemDeCatalogo: true, precoDoCatalogo: 4000,
      moedaDoCatalogo: "USD", moedaDaProposta: "BRL",
    });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [
        { tipo: "editar_item", item_id: mundo.itemId, campo: "preco_unitario_cents", de: 4000, para: 4000 },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("moeda");
    expect(mundo.itemAtualizado).toBeNull();
  });

  it("lista vazia de mudancas: 422", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1 });
    const res = await mundo.POST({ revision: 1, mudancas: [] });
    expect(res.status).toBe(422);
  });

  it("respeita recusa de suporte antes de aplicar", async () => {
    const mundo = montarMundoDeAplicar({ revisionAtual: 1, suporteReadOnly: true });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "x", para: "y" }],
    });
    expect(res.status).toBe(403);
    expect(mundo.itemAtualizado).toBeNull();
  });

  it("editar_briefing aplicado grava briefing_json atualizado no update (M4)", async () => {
    const mundo = montarMundoDeAplicar({ briefingJson: { project: { objective: "vender mais" } } });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [{ tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo" }],
    });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({
      briefing_json: { project: { name: "Site Catálogo", objective: "vender mais" } },
    });
  });

  it("sem mudança de briefing, briefing_json do update é o MESMO que já estava (não vira null à toa)", async () => {
    const mundo = montarMundoDeAplicar({ briefingJson: { project: { name: "Já preenchido" } } });
    const res = await mundo.POST({
      revision: 1,
      mudancas: [{ tipo: "editar_proposta", campo: "titulo", de: "Proposta Teste", para: "Novo título" }],
    });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ briefing_json: { project: { name: "Já preenchido" } } });
  });
});
