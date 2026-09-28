// lib/propostas/documento/variaveis.test.ts
import { describe, expect, it } from "vitest";

import { extrairVariaveis, substituirVariaveis } from "./variaveis";

describe("extrairVariaveis", () => {
  it("acha um caminho simples", () => {
    expect(extrairVariaveis("Olá {{client.name}}, tudo bem?")).toEqual(["client.name"]);
  });

  it("acha vários caminhos, sem duplicar", () => {
    expect(extrairVariaveis("{{a.b}} e {{a.b}} e {{c.d}}")).toEqual(["a.b", "c.d"]);
  });

  it("texto sem variável devolve lista vazia", () => {
    expect(extrairVariaveis("texto fixo, sem chave")).toEqual([]);
  });
});

describe("substituirVariaveis", () => {
  it("substitui um caminho simples por um valor de nível 1", () => {
    const r = substituirVariaveis("Olá {{name}}", { name: "Paulo" });
    expect(r.textoRenderizado).toBe("Olá Paulo");
    expect(r.faltantes).toEqual([]);
  });

  it("substitui um caminho aninhado (dot path)", () => {
    const r = substituirVariaveis("Cliente: {{client.name}}", { client: { name: "Acme" } });
    expect(r.textoRenderizado).toBe("Cliente: Acme");
    expect(r.faltantes).toEqual([]);
  });

  it("valor ausente vira [a definir] e entra em faltantes", () => {
    const r = substituirVariaveis("Prazo: {{project.deadline}}", {});
    expect(r.textoRenderizado).toBe("Prazo: [a definir]");
    expect(r.faltantes).toEqual(["project.deadline"]);
  });

  it("valor 0 (número) NÃO é ausente (Review Focus)", () => {
    const r = substituirVariaveis("Desconto: {{discount}}", { discount: 0 });
    expect(r.textoRenderizado).toBe("Desconto: 0");
    expect(r.faltantes).toEqual([]);
  });

  it("string vazia É ausente", () => {
    const r = substituirVariaveis("Nome: {{name}}", { name: "" });
    expect(r.textoRenderizado).toBe("Nome: [a definir]");
    expect(r.faltantes).toEqual(["name"]);
  });

  it("array vazio É ausente (regra de 'lista vazia', §7 item 4)", () => {
    const r = substituirVariaveis("Itens: {{scope.items}}", { scope: { items: [] } });
    expect(r.textoRenderizado).toBe("Itens: [a definir]");
    expect(r.faltantes).toEqual(["scope.items"]);
  });

  it("array não vazio vira string separada por vírgula", () => {
    const r = substituirVariaveis("Itens: {{scope.items}}", { scope: { items: ["a", "b"] } });
    expect(r.textoRenderizado).toBe("Itens: a, b");
    expect(r.faltantes).toEqual([]);
  });

  it("a mesma variável repetida duas vezes substitui as DUAS ocorrências (Review Focus)", () => {
    const r = substituirVariaveis("{{name}} disse oi, {{name}}!", { name: "Ana" });
    expect(r.textoRenderizado).toBe("Ana disse oi, Ana!");
  });

  it("caminho que não existe no objeto (nível intermediário ausente) não lança", () => {
    expect(() => substituirVariaveis("{{a.b.c}}", {})).not.toThrow();
    const r = substituirVariaveis("{{a.b.c}}", {});
    expect(r.faltantes).toEqual(["a.b.c"]);
  });
});
