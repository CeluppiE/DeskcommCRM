import { describe, expect, it } from "vitest";
import { MODELOS_BASE } from "./catalogo-base";

const SLUGS_ESPERADOS = [
  "site_institucional",
  "landing_page",
  "ecommerce",
  "catalogo_imobiliario",
  "site_profissional",
  "sistema_web",
  "automacao",
  "projeto_personalizado",
];

describe("MODELOS_BASE — catálogo de modelos da plataforma (código, não banco)", () => {
  it("tem os 8 modelos-piloto (pacote de modelos do dono, trazido em 25/09/2026)", () => {
    expect(Object.keys(MODELOS_BASE).sort()).toEqual([...SLUGS_ESPERADOS].sort());
  });

  it("é um objeto congelado — ninguém muta o catálogo em runtime", () => {
    expect(Object.isFrozen(MODELOS_BASE)).toBe(true);
  });

  it.each(SLUGS_ESPERADOS)("%s: slug bate com a chave, version é número, tem pelo menos 1 seção", (slug) => {
    const modelo = MODELOS_BASE[slug]!;
    expect(modelo.slug).toBe(slug);
    expect(typeof modelo.version).toBe("number");
    expect(modelo.sections.length).toBeGreaterThan(0);
  });

  it.each(SLUGS_ESPERADOS)("%s: sectionOrder não tem id fantasma nem deixa seção de fora", (slug) => {
    const modelo = MODELOS_BASE[slug]!;
    const idsDasSecoes = modelo.sections.map((s) => s.id).sort();
    const idsDaOrdem = [...modelo.sectionOrder].sort();
    expect(idsDaOrdem).toEqual(idsDasSecoes);
  });
});
