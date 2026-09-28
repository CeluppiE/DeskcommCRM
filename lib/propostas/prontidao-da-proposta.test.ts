// lib/propostas/prontidao-da-proposta.test.ts
import { describe, expect, it } from "vitest";

import { montarEntradaDeProntidao, type PropostaParaProntidao } from "./prontidao-da-proposta";

const BASE: PropostaParaProntidao = {
  contact_id: "contato-1",
  titulo: "Site catálogo",
  pricing_status: "manual",
  prazo_dias_uteis: 20,
  pagamento: "50_50",
  valid_until: "2026-12-31",
  briefing_json: { escopo: "catálogo de imóveis com filtros" },
};

describe("montarEntradaDeProntidao", () => {
  it("proposta completa fica pronta_para_envio", () => {
    const prontidao = montarEntradaDeProntidao(BASE, true);
    expect(prontidao.status).toBe("pronta_para_envio");
  });

  it("sem contato fica incompleta, mesmo com o resto preenchido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, contact_id: null }, true);
    expect(prontidao.status).toBe("incompleta");
    expect(prontidao.checklist.cliente).toBe(false);
  });

  it("prazo zero NÃO conta como prazo definido (Review Focus)", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, prazo_dias_uteis: 0 }, true);
    expect(prontidao.checklist.prazo).toBe(false);
  });

  it("prazo negativo NÃO conta como prazo definido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, prazo_dias_uteis: -5 }, true);
    expect(prontidao.checklist.prazo).toBe(false);
  });

  it("briefing_json null não lança e conta como escopo ausente (Review Focus)", () => {
    expect(() => montarEntradaDeProntidao({ ...BASE, briefing_json: null }, true)).not.toThrow();
    const prontidao = montarEntradaDeProntidao({ ...BASE, briefing_json: null }, true);
    expect(prontidao.checklist.escopo).toBe(false);
  });

  it("briefing_json objeto vazio não lança e conta como escopo ausente", () => {
    expect(() => montarEntradaDeProntidao({ ...BASE, briefing_json: {} }, true)).not.toThrow();
    const prontidao = montarEntradaDeProntidao({ ...BASE, briefing_json: {} }, true);
    expect(prontidao.checklist.escopo).toBe(false);
  });

  it("pricing_status missing conta como preço não definido", () => {
    const prontidao = montarEntradaDeProntidao({ ...BASE, pricing_status: "missing" }, true);
    expect(prontidao.checklist.investimento).toBe(false);
  });

  it("sem itens com preço conta como conteúdo incompleto", () => {
    const prontidao = montarEntradaDeProntidao(BASE, false);
    expect(prontidao.checklist.conteudo).toBe(false);
  });
});
