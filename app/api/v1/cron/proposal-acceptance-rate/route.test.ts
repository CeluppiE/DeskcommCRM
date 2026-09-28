import { describe, expect, it } from "vitest";
import { calcularTaxaDeAceite, organizacoesComPropostas } from "./route";

describe("calcularTaxaDeAceite", () => {
  it("3 aceitas de 10 decididas (aceita+recusada): 30%", () => {
    const propostas = [
      ...Array(3).fill({ status: "aceita" }),
      ...Array(7).fill({ status: "recusada" }),
      ...Array(2).fill({ status: "enviada" }), // ainda não decidida — fora do denominador
    ];
    expect(calcularTaxaDeAceite(propostas as never)).toBe(0.3);
  });

  it("zero decididas: null (sem dado suficiente, não é zero)", () => {
    expect(calcularTaxaDeAceite([{ status: "enviada" }] as never)).toBeNull();
  });

  it("taxa abaixo do piso (30%) dispara; acima, não", () => {
    expect(calcularTaxaDeAceite(Array(2).fill({ status: "aceita" }).concat(Array(8).fill({ status: "recusada" })) as never)).toBeLessThan(0.3);
    expect(calcularTaxaDeAceite(Array(8).fill({ status: "aceita" }).concat(Array(2).fill({ status: "recusada" })) as never)).toBeGreaterThan(0.3);
  });
});

describe("organizacoesComPropostas", () => {
  const orgs = [
    { id: "a", settings: { proposals: { enabled: true } } },
    { id: "b", settings: { proposals: { enabled: false } } },
    { id: "c", settings: null },
  ];
  it("só as organizações com a capacidade ligada entram na rodada", () => {
    expect(organizacoesComPropostas(orgs, ["propostas"])).toEqual(["a"]);
  });
  it("com o módulo desligado na instalação, nenhuma entra (doc 79)", () => {
    expect(organizacoesComPropostas(orgs, [])).toEqual([]);
  });
});
