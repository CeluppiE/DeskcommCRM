// lib/propostas/documento/documento-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolverModelo = vi.hoisted(() => vi.fn());
vi.mock("../modelos/resolver", () => ({ resolverModelo }));

import { MODELOS_BASE } from "../modelos/catalogo-base";
import { lerSecoesEditadas, montarDocumentoDaProposta, type PropostaParaDocumento } from "./documento-da-proposta";

const ORG = "22222222-2222-4222-8222-222222222222";
const db = {} as never;

function proposta(over: Partial<PropostaParaDocumento> = {}): PropostaParaDocumento {
  return {
    template_slug: "site_institucional",
    secoes_editadas: null,
    briefing_json: null,
    total_cents: 350000,
    moeda: "BRL",
    prazo_dias_uteis: null,
    valid_until: "2026-10-16",
    created_at: "2026-09-26T00:00:00.000Z",
    ...over,
  };
}

const BRIEFING_COMPLETO = {
  client: { company: "Imobiliária Exemplo" },
  project: { name: "Site da imobiliária", objective: "gerar contatos de compradores" },
  scope: { pages_list: "Home, Sobre, Contato" },
  included: { list: "Layout, desenvolvimento e publicação" },
  excluded: { list: "Hospedagem e domínio" },
};

beforeEach(() => {
  resolverModelo.mockReset();
  resolverModelo.mockImplementation(async (_db: unknown, _org: string, slug: string) =>
    Object.hasOwn(MODELOS_BASE, slug) ? { ...MODELOS_BASE[slug]!, origem: "base" } : null,
  );
});

describe("montarDocumentoDaProposta", () => {
  it("sem modelo confirmado devolve null e nem consulta o modelo", async () => {
    expect(await montarDocumentoDaProposta(db, ORG, proposta({ template_slug: null }), null)).toBeNull();
    expect(resolverModelo).not.toHaveBeenCalled();
  });

  it("modelo que não resolve devolve null", async () => {
    expect(await montarDocumentoDaProposta(db, ORG, proposta({ template_slug: "nao_existe" }), null)).toBeNull();
  });

  it("MODELO REAL com briefing e prazo preenchidos: zero pendência (o bloqueio de §1.5 da spec)", async () => {
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ briefing_json: BRIEFING_COMPLETO, prazo_dias_uteis: 30 }),
      { name: "Maria", display_name: null },
    );
    expect(doc?.pendencias).toEqual([]);
    expect(doc?.camposFaltando).toEqual([]);
  });

  it("sem prazo, a pendência aponta para o campo de prazo, com nome legível", async () => {
    const doc = await montarDocumentoDaProposta(db, ORG, proposta({ briefing_json: BRIEFING_COMPLETO }), {
      name: "Maria",
      display_name: null,
    });
    expect(doc?.camposFaltando).toEqual([
      { caminho: "schedule.estimated_days", rotulo: "Prazo (dias úteis)", onde: "campo_prazo", secoes: ["schedule"] },
    ]);
  });

  it("variável usada em várias seções aparece UMA vez em camposFaltando, com todas as seções", async () => {
    // `excluded.list` está em DUAS seções do projeto_personalizado: "limitations" e "excluded".
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ template_slug: "projeto_personalizado", prazo_dias_uteis: 30 }),
      { name: "Maria", display_name: null },
    );
    const excluidos = doc?.camposFaltando.filter((c) => c.caminho === "excluded.list") ?? [];
    expect(excluidos).toHaveLength(1);
    expect(excluidos[0]!.secoes).toEqual(["limitations", "excluded"]);
    expect(doc?.pendencias.filter((p) => p === "excluded.list")).toHaveLength(2);
  });

  it("seção reescrita não gera pendência, fica marcada como editada e mantém o texto", async () => {
    const doc = await montarDocumentoDaProposta(
      db,
      ORG,
      proposta({ briefing_json: BRIEFING_COMPLETO, prazo_dias_uteis: 30, secoes_editadas: { summary: "Texto final." } }),
      { name: "Maria", display_name: null },
    );
    const resumo = doc?.secoes.find((s) => s.id === "summary");
    expect(resumo).toMatchObject({ body: "Texto final.", faltantes: [], editada: true });
    expect(doc?.secoes.find((s) => s.id === "objectives")?.editada).toBe(false);
  });
});

describe("lerSecoesEditadas", () => {
  it("ignora lixo de clone antigo, nunca lança", () => {
    expect(lerSecoesEditadas(null)).toEqual({});
    expect(lerSecoesEditadas(["a"])).toEqual({});
    expect(lerSecoesEditadas("texto")).toEqual({});
    expect(lerSecoesEditadas({ a: "ok", b: 3, c: null })).toEqual({ a: "ok" });
  });
});
