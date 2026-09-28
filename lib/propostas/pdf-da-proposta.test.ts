// lib/propostas/pdf-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CampoFaltando } from "./documento/documento-da-proposta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  montarDocumentoDaProposta: vi.fn(),
  renderDocumentoPdf: vi.fn(),
  marcaDaOrganizacaoParaPdf: vi.fn(),
}));

const estado: { camposFaltando: CampoFaltando[] } = vi.hoisted(() => ({ camposFaltando: [] }));

vi.mock("./documento/documento-da-proposta", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, montarDocumentoDaProposta: mocks.montarDocumentoDaProposta };
});
vi.mock("./documento/pdf-do-documento", () => ({ renderDocumentoPdf: mocks.renderDocumentoPdf }));
vi.mock("./marca-da-organizacao-para-pdf", () => ({
  marcaDaOrganizacaoParaPdf: mocks.marcaDaOrganizacaoParaPdf,
}));

import { montarPdfDaProposta, type PropostaParaPdf } from "./pdf-da-proposta";

const ORG_ID = "22222222-2222-4222-8222-222222222222";

function propostaBase(slug: string | null): PropostaParaPdf {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contact_id: "contato-1",
    titulo: "Site da imobiliária",
    versao: 1,
    condicoes: "50% no aceite",
    template_slug: slug,
    secoes_editadas: null,
    briefing_json: { project: { name: "Site da imobiliária" } },
    total_cents: 350000,
    moeda: "BRL",
    prazo_dias_uteis: 30,
    valid_until: "2026-12-31",
    created_at: "2026-09-26T00:00:00.000Z",
  };
}

function montarAdmin() {
  return {
    from: vi.fn((tabela: string) => {
      if (tabela === "crm_proposal_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      descricao: "Site institucional",
                      quantidade: 1,
                      preco_unitario_cents: 350000,
                      desconto_cents: 0,
                      product_id: null,
                    },
                  ],
                  error: null,
                }),
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
                maybeSingle: async () => ({
                  data: { name: "Maria", display_name: "Maria", email: null, phone_number: null },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  estado.camposFaltando = [];
  mocks.montarDocumentoDaProposta.mockImplementation(
    async (_db: unknown, _org: string, proposta: PropostaParaPdf) => {
      if (!proposta.template_slug) return null;
      return {
        modelo: { slug: proposta.template_slug },
        secoes: [{ id: "resumo", body: "Projeto: [a definir]", faltantes: [] }],
        pendencias: estado.camposFaltando.map((c) => c.caminho),
        camposFaltando: estado.camposFaltando,
      };
    },
  );
  mocks.marcaDaOrganizacaoParaPdf.mockResolvedValue({ appName: "Loja X", accentHex: "#111111", logoUrl: null });
  mocks.renderDocumentoPdf.mockImplementation(async () => Buffer.from("%PDF-1.4 proposta"));
});

describe("montarPdfDaProposta", () => {
  it("sem permitirPendencias, campo faltando recusa com o motivo", async () => {
    estado.camposFaltando = [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["resumo"] },
    ];
    const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("Faltam 1 campo(s)");
    expect(mocks.renderDocumentoPdf).not.toHaveBeenCalled();
  });

  it("com permitirPendencias, campo faltando devolve ok", async () => {
    estado.camposFaltando = [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["resumo"] },
    ];
    const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
      permitirPendencias: true,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.buffer.length).toBeGreaterThan(0);
    expect(mocks.renderDocumentoPdf).toHaveBeenCalled();
  });

  it("sem modelo recusa nos dois casos", async () => {
    const admin = montarAdmin() as never;
    const semOpcao = await montarPdfDaProposta(admin, ORG_ID, propostaBase(null), {
      numero: null,
      ano: null,
      t: (texto: string) => texto,
    });
    expect(semOpcao.ok).toBe(false);
    if (!semOpcao.ok) expect(semOpcao.motivo).toContain("modelo da proposta");

    const comOpcao = await montarPdfDaProposta(admin, ORG_ID, propostaBase(null), {
      numero: null,
      ano: null,
      t: (texto: string) => texto,
      permitirPendencias: true,
    });
    expect(comOpcao.ok).toBe(false);
    if (!comOpcao.ok) expect(comOpcao.motivo).toContain("modelo da proposta");
    expect(mocks.renderDocumentoPdf).not.toHaveBeenCalled();
  });
});
