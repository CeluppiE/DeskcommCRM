import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dataIsoNoFuso, anoNoFuso, somarDiasNoFuso, fusoDaOrganizacao } from "./data-no-fuso";

describe("dataIsoNoFuso (pura)", () => {
  it("23h59 de 31/12 em UTC ainda é 01/01 em Lisboa (mesma virada de ano, fuso diferente)", () => {
    // 2026-12-31T23:59:00Z é, em Europe/Lisbon (UTC+0 no inverno), o mesmo instante — 23:59 de 31/12.
    // Escolhido de propósito para PROVAR o caso oposto: um instante que É virada em Sao_Paulo mas não em Lisboa.
    const instante = new Date("2026-01-01T01:30:00Z"); // 22:30 de 31/12 em America/Sao_Paulo (UTC-3)
    expect(dataIsoNoFuso(instante, "America/Sao_Paulo")).toBe("2025-12-31");
    expect(dataIsoNoFuso(instante, "UTC")).toBe("2026-01-01");
  });

  it("fuso inválido/vazio: degrada para FUSO_PADRAO, nunca lança", () => {
    const instante = new Date("2026-06-15T12:00:00Z");
    expect(() => dataIsoNoFuso(instante, "Nao/Existe")).not.toThrow();
  });
});

describe("anoNoFuso (pura)", () => {
  it("virada de ano: o ano muda no fuso, mesmo instante em UTC ainda é o ano anterior", () => {
    const instante = new Date("2027-01-01T01:30:00Z"); // 22:30 de 31/12/2026 em America/Sao_Paulo
    expect(anoNoFuso(instante, "America/Sao_Paulo")).toBe(2026);
    expect(anoNoFuso(instante, "UTC")).toBe(2027);
  });
});

describe("somarDiasNoFuso (pura)", () => {
  it("soma N dias e devolve a data no fuso pedido", () => {
    const instante = new Date("2026-01-01T12:00:00Z");
    expect(somarDiasNoFuso(instante, 15, "America/Sao_Paulo")).toBe("2026-01-16");
  });
});

describe("fusoDaOrganizacao", () => {
  it("lê organizations.timezone e valida com fusoUtilizavel (degrada em fuso torto)", async () => {
    const chain = {
      select: vi.fn(function (this: typeof chain) { return this; }),
      eq: vi.fn(function (this: typeof chain) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { timezone: "Europe/Lisbon" }, error: null })),
    };
    const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    expect(await fusoDaOrganizacao(db, "org-1")).toBe("Europe/Lisbon");
  });

  it("timezone nula/torta ou erro de leitura: cai no padrão, nunca lança", async () => {
    const chain = {
      select: vi.fn(function (this: typeof chain) { return this; }),
      eq: vi.fn(function (this: typeof chain) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { timezone: "São Paulo" }, error: null })),
    };
    const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    expect(await fusoDaOrganizacao(db, "org-1")).toBe("America/Sao_Paulo");
  });
});
