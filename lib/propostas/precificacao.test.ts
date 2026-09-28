// lib/propostas/precificacao.test.ts
import { describe, expect, it } from "vitest";
import { calcularPricingStatus } from "./precificacao";

describe("calcularPricingStatus", () => {
  it("proposta sem item nenhum: missing", () => {
    expect(calcularPricingStatus([])).toBe("missing");
  });

  it("todo item tem preço e TODOS vêm do catálogo: catalog", () => {
    expect(
      calcularPricingStatus([
        { product_id: "p1", preco_unitario_cents: 1000 },
        { product_id: "p2", preco_unitario_cents: 2000 },
      ]),
    ).toBe("catalog");
  });

  it("todo item tem preço mas ao menos um é manual (sem product_id): manual", () => {
    expect(
      calcularPricingStatus([
        { product_id: "p1", preco_unitario_cents: 1000 },
        { product_id: null, preco_unitario_cents: 2000 },
      ]),
    ).toBe("manual");
  });

  it("qualquer item sem preço (mesmo com outros preenchidos): missing", () => {
    expect(
      calcularPricingStatus([
        { product_id: "p1", preco_unitario_cents: 1000 },
        { product_id: null, preco_unitario_cents: null },
      ]),
    ).toBe("missing");
  });
});
