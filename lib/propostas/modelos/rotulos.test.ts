// lib/propostas/modelos/rotulos.test.ts
import { describe, expect, it } from "vitest";
import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";

describe("ROTULO_DO_MODELO — todo modelo do catálogo tem rótulo amigável", () => {
  it("as duas listas de chaves são exatamente iguais", () => {
    const chavesDoCatalogo = Object.keys(MODELOS_BASE).sort();
    const chavesDosRotulos = Object.keys(ROTULO_DO_MODELO).sort();
    expect(chavesDosRotulos).toEqual(chavesDoCatalogo);
  });

  it("nenhum rótulo é vazio", () => {
    for (const rotulo of Object.values(ROTULO_DO_MODELO)) {
      expect(rotulo.trim().length).toBeGreaterThan(0);
    }
  });
});
