// lib/propostas/documento/renderer.test.ts
import { describe, expect, it } from "vitest";

import { renderizarDocumento } from "./renderer";
import type { ModeloBase } from "../modelos/tipos";

const MODELO: ModeloBase = {
  slug: "teste",
  version: 1,
  sectionOrder: ["resumo", "diagnostico", "obrigatoria_e_condicional", "fantasma"],
  sections: [
    { id: "resumo", title: "Resumo", titleEs: null, body: "Projeto: {{project.name}}", bodyEs: null, required: true, conditional: false },
    { id: "diagnostico", title: "Diagnóstico", titleEs: null, body: "Achado: {{survey.findings}}", bodyEs: null, required: false, conditional: true },
    { id: "obrigatoria_e_condicional", title: "Garantia", titleEs: null, body: "Prazo de garantia: {{warranty.days}}", bodyEs: null, required: true, conditional: true },
    { id: "sem_id_correspondente", title: "Nunca aparece", titleEs: null, body: "x", bodyEs: null, required: false, conditional: false },
  ],
};

describe("renderizarDocumento", () => {
  it("renderiza na ordem de sectionOrder, com as variáveis substituídas", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "Site Catálogo" } });
    expect(doc.secoes[0]).toMatchObject({ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo" });
  });

  it("seção condicional SEM nenhum dado é omitida por inteiro (§7 item 3)", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    expect(doc.secoes.find((s) => s.id === "diagnostico")).toBeUndefined();
  });

  it("seção condicional COM dado aparece normal, com [a definir] só onde faltar", () => {
    const doc = renderizarDocumento(MODELO, {
      project: { name: "X" },
      survey: { findings: "telhado com infiltração" },
    });
    expect(doc.secoes.find((s) => s.id === "diagnostico")).toMatchObject({
      body: "Achado: telhado com infiltração",
    });
  });

  it("required + conditional juntos: required vence, aparece sempre (Review Focus)", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    const garantia = doc.secoes.find((s) => s.id === "obrigatoria_e_condicional");
    expect(garantia).toBeDefined();
    expect(garantia?.body).toBe("Prazo de garantia: [a definir]");
  });

  it("id em sectionOrder sem seção correspondente não lança (Review Focus)", () => {
    expect(() => renderizarDocumento(MODELO, {})).not.toThrow();
  });

  it("acumula variaveisFaltando só das seções que APARECEM no documento", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    // "diagnostico" foi omitida (condicional sem dado) — sua variável NÃO entra.
    expect(doc.variaveisFaltando).not.toContain("survey.findings");
    // "obrigatoria_e_condicional" apareceu (required) — sua variável entra.
    expect(doc.variaveisFaltando).toContain("warranty.days");
  });

  it("modelo com sections vazio devolve documento vazio, sem lançar", () => {
    const vazio: ModeloBase = { slug: "vazio", version: 1, sections: [], sectionOrder: [] };
    const doc = renderizarDocumento(vazio, {});
    expect(doc.secoes).toEqual([]);
    expect(doc.variaveisFaltando).toEqual([]);
  });

  it("cada seção carrega as PRÓPRIAS variáveis faltando (não só o agregado)", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    const garantia = doc.secoes.find((s) => s.id === "obrigatoria_e_condicional");
    expect(garantia?.faltantes).toEqual(["warranty.days"]);
    const resumo = doc.secoes.find((s) => s.id === "resumo");
    expect(resumo?.faltantes).toEqual([]);
  });
});
