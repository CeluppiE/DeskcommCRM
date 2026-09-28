// lib/propostas/moeda.test.ts
import { describe, expect, it } from "vitest";

import { formatarMoeda } from "./moeda";

describe("formatarMoeda", () => {
  it("formata centavos em real", () => {
    expect(formatarMoeda(150000, "BRL")).toBe(
      (150000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
  });

  it("formata centavos em outra moeda (D11 — moeda da organização)", () => {
    expect(formatarMoeda(150000, "USD")).toBe(
      (150000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD" }),
    );
  });
});
