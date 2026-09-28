// lib/propostas/padroes-da-organizacao.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolverPadroesDaProposta, buscarPadroesDaOrganizacao } from "./padroes-da-organizacao";

describe("resolverPadroesDaProposta (pura)", () => {
  it("settings vazio: 15 dias, sem condições (mesmo default de hoje)", () => {
    expect(resolverPadroesDaProposta(null)).toEqual({ defaultValidDays: 15, defaultConditions: null, followupDias: 3, avisarNoWhatsApp: true });
  });

  it("settings.proposals com os dois valores configurados", () => {
    expect(
      resolverPadroesDaProposta({ proposals: { default_valid_days: 30, default_conditions: "Pagamento em 2x" } }),
    ).toEqual({ defaultValidDays: 30, defaultConditions: "Pagamento em 2x", followupDias: 3, avisarNoWhatsApp: true });
  });

  it("settings malformado (não é objeto): degrada para o default, nunca lança", () => {
    expect(resolverPadroesDaProposta("string-invalida" as unknown)).toEqual({
      defaultValidDays: 15, defaultConditions: null, followupDias: 3, avisarNoWhatsApp: true,
    });
  });

  it("followup_dias ausente: default 3", () => {
    expect(resolverPadroesDaProposta(null).followupDias).toBe(3);
  });

  it("followup_dias configurado: usa o valor", () => {
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: 7 } }).followupDias).toBe(7);
  });

  it("followup_dias inválido (negativo/string): degrada para o default", () => {
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: -1 } }).followupDias).toBe(3);
    expect(resolverPadroesDaProposta({ proposals: { followup_dias: "sete" } }).followupDias).toBe(3);
  });
});

describe("avisar no WhatsApp (P4B)", () => {
  it("ausente = ligado (quem configurou o Aviso no WhatsApp já escolheu receber)", () => {
    expect(resolverPadroesDaProposta({ proposals: {} }).avisarNoWhatsApp).toBe(true);
    expect(resolverPadroesDaProposta(null).avisarNoWhatsApp).toBe(true);
  });
  it("false explícito desliga", () => {
    expect(resolverPadroesDaProposta({ proposals: { avisar_no_whatsapp: false } }).avisarNoWhatsApp).toBe(false);
  });
});

describe("buscarPadroesDaOrganizacao", () => {
  it("busca organizations.settings e aplica a regra pura", async () => {
    const chain = {
      select: vi.fn(function (this: typeof chain) { return this; }),
      eq: vi.fn(function (this: typeof chain) { return this; }),
      single: vi.fn(async () => ({ data: { settings: { proposals: { default_valid_days: 7, default_conditions: "À vista" } } }, error: null })),
    };
    const db = { from: vi.fn(() => chain) } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const r = await buscarPadroesDaOrganizacao(db, "org-1");
    expect(r).toEqual({ defaultValidDays: 7, defaultConditions: "À vista", followupDias: 3, avisarNoWhatsApp: true });
  });
});
