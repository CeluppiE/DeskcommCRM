// lib/propostas/itens.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolverItensDaProposta } from "./itens";

function montarSupabase(precoDoCatalogo: number | null, moedaDoCatalogo = "BRL") {
  const chain = {
    select: vi.fn(function (this: typeof chain) { return this; }),
    eq: vi.fn(function (this: typeof chain) { return this; }),
    maybeSingle: vi.fn(async () => (
      precoDoCatalogo === null ? { data: null, error: null } : { data: { preco_cents: precoDoCatalogo, moeda: moedaDoCatalogo }, error: null }
    )),
  };
  return { from: vi.fn(() => chain) } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const itemManual = (over: Record<string, unknown> = {}) => ({
  product_id: null, descricao: "Item manual", quantidade: 1,
  preco_unitario_cents: 1500, desconto_cents: 0, position: 1000, ...over,
});
const itemDoCatalogo = (over: Record<string, unknown> = {}) => ({
  product_id: "prod-1", descricao: "Ignorado — preço vem do catálogo", quantidade: 1,
  // preço mandado pelo CLIENTE — tem que ser IGNORADO pelo resolver.
  preco_unitario_cents: 999999, desconto_cents: 0, position: 2000, ...over,
});

describe("resolverItensDaProposta", () => {
  it("item manual (sem product_id): mantém o preço do input", async () => {
    const db = montarSupabase(null);
    const r = await resolverItensDaProposta(db, "org-1", [itemManual()], "BRL");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens[0]?.preco_unitario_cents).toBe(1500);
      expect(r.pricingStatus).toBe("manual");
      expect(r.totalCents).toBe(1500);
    }
  });

  it("item com product_id: preço vem do catálogo, NUNCA do que o cliente mandou", async () => {
    const db = montarSupabase(2500);
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens[0]?.preco_unitario_cents).toBe(2500);
      expect(r.pricingStatus).toBe("catalog");
      expect(r.totalCents).toBe(2500);
    }
  });

  it("product_id que não resolve na organização (outra org, apagado, inativo): item inteiro recusado", async () => {
    const db = montarSupabase(null);
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("não encontrado no catálogo");
  });

  it("item sem product_id E sem preço: aceito como 'a definir' (missing)", async () => {
    const db = montarSupabase(null);
    const r = await resolverItensDaProposta(db, "org-1", [itemManual({ preco_unitario_cents: null })], "BRL");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens[0]?.preco_unitario_cents).toBeNull();
      expect(r.pricingStatus).toBe("missing");
      expect(r.totalCents).toBe(0);
    }
  });

  it("lista vazia: ok, pricing_status missing, total zero", async () => {
    const db = montarSupabase(null);
    const r = await resolverItensDaProposta(db, "org-1", [], "BRL");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens).toEqual([]);
      expect(r.pricingStatus).toBe("missing");
      expect(r.totalCents).toBe(0);
    }
  });

  it("item de catálogo em moeda DIFERENTE da proposta: recusado com mensagem clara (D11)", async () => {
    const db = montarSupabase(5000, "USD");
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("moeda");
  });

  it("item de catálogo na MESMA moeda da proposta: aceito normalmente", async () => {
    const db = montarSupabase(5000, "BRL");
    const r = await resolverItensDaProposta(db, "org-1", [itemDoCatalogo()], "BRL");
    expect(r.ok).toBe(true);
  });
});
