// lib/propostas/documento/montar-dados.test.ts
import { describe, expect, it } from "vitest";

import { LINHA_EM_BRANCO, montarDadosDoDocumento } from "./montar-dados";

describe("montarDadosDoDocumento", () => {
  it("espalha o briefing_json no resultado", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: { project: { name: "Site Catálogo" } } }, null);
    expect(dados).toMatchObject({ project: { name: "Site Catálogo" } });
  });

  it("numero é sempre null (renderer reafirma, não confia — Global Constraint da M2)", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: { numero: 42 } }, null);
    expect(dados.numero).toBeNull();
  });

  it("briefing_json null não lança, devolve objeto só com numero", () => {
    expect(() => montarDadosDoDocumento(PROPOSTA_BASE, null)).not.toThrow();
    expect(montarDadosDoDocumento(PROPOSTA_BASE, null)).toMatchObject({ numero: null });
  });

  it("briefing_json que não é objeto (array, string) é ignorado, não lança", () => {
    expect(montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: ["x"] }, null)).toMatchObject({ numero: null });
    expect(montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: "texto solto" }, null)).toMatchObject({
      numero: null,
    });
  });
});

const PROPOSTA_BASE = {
  briefing_json: null,
  total_cents: 250000,
  moeda: "BRL",
  prazo_dias_uteis: 20,
  valid_until: "2026-10-16T00:00:00.000Z",
  created_at: "2026-09-26T00:00:00.000Z",
};

describe("montarDadosDoDocumento — preço, prazo e validade (nunca vêm do briefing)", () => {
  it("investment.total_formatted vem de total_cents + moeda, formatado por formatCents", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    // formatCents usa NBSP entre símbolo e número — normaliza antes de
    // comparar com o literal (o literal do plano usa espaço comum).
    const total = (dados.investment as { total_formatted: string }).total_formatted.replace(/\u00a0/g, " ");
    expect(total).toBe("R$ 2.500,00");
  });

  it("schedule.estimated_days vem de prazo_dias_uteis, mesmo se o briefing tentar mandar outro valor", () => {
    const dados = montarDadosDoDocumento(
      { ...PROPOSTA_BASE, briefing_json: { schedule: { estimated_days: 999 } } },
      null,
    );
    expect(dados.schedule).toMatchObject({ estimated_days: 20 });
  });

  it("commercial_terms.validity_days é a diferença em dias entre valid_until e created_at", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.commercial_terms).toMatchObject({ validity_days: 20 });
  });

  it("commercial_terms.validity_days é null quando a proposta não tem valid_until", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, valid_until: null }, null);
    expect(dados.commercial_terms).toMatchObject({ validity_days: null });
  });

  it("client.name vem do contato (name escolhido antes de display_name — regra da #906); client.company vem do briefing", () => {
    const dados = montarDadosDoDocumento(
      { ...PROPOSTA_BASE, briefing_json: { client: { company: "Imobiliária Rio" } } },
      { name: "João da Silva", display_name: "João" },
    );
    expect(dados.client).toMatchObject({
      name: "João da Silva",
      company: "Imobiliária Rio",
      company_or_name: "Imobiliária Rio",
    });
  });

  it("client.company_or_name cai para o nome do contato quando não há company no briefing", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, { name: "João da Silva", display_name: null });
    expect(dados.client).toMatchObject({ name: "João da Silva", company_or_name: "João da Silva" });
  });

  it("contato null não lança — client.name cai para o que o briefing tiver, ou null", () => {
    expect(() => montarDadosDoDocumento(PROPOSTA_BASE, null)).not.toThrow();
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.client).toMatchObject({ name: null, company_or_name: null });
  });
});

describe("montarDadosDoDocumento — aprovação (D2 da spec de 26/09)", () => {
  it("approval.date é sempre a linha em branco da assinatura", () => {
    const dados = montarDadosDoDocumento(PROPOSTA_BASE, null);
    expect(dados.approval).toEqual({ date: LINHA_EM_BRANCO });
  });

  it("o briefing não consegue preencher approval.date", () => {
    const dados = montarDadosDoDocumento({ ...PROPOSTA_BASE, briefing_json: { approval: { date: "01/01/2026" } } }, null);
    expect(dados.approval).toEqual({ date: LINHA_EM_BRANCO });
  });
});
