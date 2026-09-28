// lib/propostas/modelos/validar-modelo.test.ts
import { describe, expect, it } from "vitest";

import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";
import { slugDaEmpresa, validarModelo, type ModeloEditavel } from "./validar-modelo";

const secao = (id: string, body = "Texto de {{project.name}}.") => ({
  id, title: `Título ${id}`, titleEs: null, body, bodyEs: null, required: true, conditional: false,
});

function modelo(over: Partial<ModeloEditavel> = {}): ModeloEditavel {
  return { nome: "Locação", descricao: null, sections: [secao("summary"), secao("terms")], sectionOrder: ["summary", "terms"], ...over };
}

describe("validarModelo", () => {
  it("os 8 modelos da plataforma são válidos (controle positivo)", () => {
    for (const [slug, m] of Object.entries(MODELOS_BASE)) {
      expect(validarModelo({ nome: ROTULO_DO_MODELO[slug]!, descricao: null, sections: m.sections, sectionOrder: m.sectionOrder }), slug).toEqual([]);
    }
  });

  it("recusa modelo sem seção", () => {
    expect(validarModelo(modelo({ sections: [], sectionOrder: [] })).map((e) => e.campo)).toContain("sections");
  });

  it("recusa id repetido e id fora do formato", () => {
    const erros = validarModelo(modelo({ sections: [secao("a"), secao("a"), secao("Com Espaço")], sectionOrder: ["a", "a", "Com Espaço"] }));
    expect(erros.some((e) => e.mensagem.includes("repetido"))).toBe(true);
    expect(erros.some((e) => e.campo === "sections.2.id")).toBe(true);
  });

  it("recusa sectionOrder que não bate com as seções", () => {
    expect(validarModelo(modelo({ sectionOrder: ["summary"] })).map((e) => e.campo)).toContain("sectionOrder");
  });

  it("recusa {{ sem fechar e variável com segmento perigoso", () => {
    const erros = validarModelo(modelo({ sections: [secao("summary", "Texto {{project.name"), secao("terms", "{{__proto__.x}}")] }));
    expect(erros.map((e) => e.campo)).toEqual(expect.arrayContaining(["sections.0.body", "sections.1.body"]));
  });

  it("recusa nome curto demais e título vazio", () => {
    const erros = validarModelo(modelo({ nome: "x", sections: [{ ...secao("summary"), title: " " }, secao("terms")] }));
    expect(erros.map((e) => e.campo)).toEqual(expect.arrayContaining(["nome", "sections.0.title"]));
  });
});

describe("slugDaEmpresa", () => {
  it("minúsculo, sem acento, com prefixo", () => {
    expect(slugDaEmpresa("Locação por Temporada!")).toBe("empresa_locacao_por_temporada");
  });
  it("nome só de símbolos ainda gera slug válido", () => {
    expect(slugDaEmpresa("!!!")).toBe("empresa_modelo");
  });
});
