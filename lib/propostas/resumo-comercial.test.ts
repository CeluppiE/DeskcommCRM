// lib/propostas/resumo-comercial.test.ts
import { describe, expect, it } from "vitest";

import { gerarResumoComercial } from "./resumo-comercial";

const BASE = {
  tituloProjeto: "Site catálogo de imóveis",
  totalCents: 500000,
  moeda: "BRL",
  prazoDiasUteis: 20,
  pagamento: "50_50",
  validUntil: "2026-12-31",
  pricingStatus: "manual" as const,
};

describe("gerarResumoComercial", () => {
  it("monta projeto + investimento + prazo + pagamento + validade", () => {
    const resumo = gerarResumoComercial(BASE);
    expect(resumo).toContain("Site catálogo de imóveis");
    expect(resumo).toContain("20 dias úteis");
    expect(resumo).toContain("50_50");
    expect(resumo).toContain("31/12/2026");
  });

  it("preço 'A definir' quando pricingStatus é missing — NUNCA R$ 0,00 (spec-mãe §5.1)", () => {
    const resumo = gerarResumoComercial({ ...BASE, pricingStatus: "missing", totalCents: 0 });
    expect(resumo).toContain("A definir");
    expect(resumo).not.toContain("R$ 0,00");
  });

  it("prazo ausente não aparece como '0 dias úteis'", () => {
    const resumo = gerarResumoComercial({ ...BASE, prazoDiasUteis: null });
    expect(resumo).not.toContain("0 dias úteis");
    expect(resumo).toContain("Prazo: a combinar");
  });

  it("pagamento ausente mostra placeholder, não string vazia solta", () => {
    const resumo = gerarResumoComercial({ ...BASE, pagamento: null });
    expect(resumo).toContain("Pagamento: a combinar");
  });

  it("validade ausente mostra placeholder", () => {
    const resumo = gerarResumoComercial({ ...BASE, validUntil: null });
    expect(resumo).toContain("Validade: a combinar");
  });
});
