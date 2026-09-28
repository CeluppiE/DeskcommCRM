// lib/propostas/briefing-universal.test.ts
import { describe, expect, it } from "vitest";

import {
  CATEGORIAS_DO_BRIEFING,
  categoriasFaltando,
  confirmacaoDoBriefingSchema,
  fraseConfere,
  normalizar,
  nucleoDoBriefingSchema,
} from "./briefing-universal";

function nucleoCompleto() {
  return {
    objetivo: "Vender mais pelo site",
    entregas: "Site com catálogo e contato",
    o_que_o_cliente_tem: "Domínio e logo",
    responsabilidades: "Cliente manda fotos, empresa monta",
    prazo: "Até o fim do mês",
    decisao_e_orcamento: "O dono decide, faixa de 5 mil",
    referencia: "Gosta do site da Perfil",
  };
}

describe("categoriasFaltando", () => {
  it("núcleo completo não deve nada", () => {
    expect(categoriasFaltando({ nucleo: nucleoCompleto() })).toEqual([]);
  });

  it("aponta as chaves ausentes", () => {
    const resto = nucleoCompleto() as Record<string, unknown>;
    delete resto.prazo;
    delete resto.referencia;
    expect(categoriasFaltando({ nucleo: resto })).toEqual(["prazo", "referencia"]);
  });

  it("string vazia ou só espaço conta como faltando", () => {
    expect(categoriasFaltando({ nucleo: { ...nucleoCompleto(), prazo: "   " } })).toEqual(["prazo"]);
  });

  it('"cliente_nao_sabe" e "nao_se_aplica" contam como preenchido', () => {
    const nucleo = { ...nucleoCompleto(), referencia: "cliente_nao_sabe", prazo: "nao_se_aplica" };
    expect(categoriasFaltando({ nucleo })).toEqual([]);
  });

  it("briefing ausente ou malformado devolve as 7, sem lançar", () => {
    expect(categoriasFaltando(undefined)).toHaveLength(7);
    expect(categoriasFaltando(null)).toHaveLength(7);
    expect(categoriasFaltando("texto solto")).toHaveLength(7);
    expect(categoriasFaltando({ nucleo: "não é objeto" })).toHaveLength(7);
    expect(() => categoriasFaltando({ nucleo: { objetivo: 42 } })).not.toThrow();
    expect(categoriasFaltando({ nucleo: { objetivo: 42 } })).toContain("objetivo");
  });
});

describe("fraseConfere", () => {
  it('mensagem inteira "sim" casa', () => {
    expect(fraseConfere("sim", ["Sim"])).toBe(true);
  });

  it('"sim" NÃO casa dentro de "assim que puder"', () => {
    expect(fraseConfere("sim", ["assim que puder"])).toBe(false);
  });

  it("trecho de 12+ caracteres casa com acento e maiúsculas diferentes", () => {
    expect(fraseConfere("CERTO, PODE MANDAR", ["certo, pode mandar o resumo"])).toBe(true);
    expect(fraseConfere("pode mandar o resumo", ["Certo, póde mandar o resúmo!"])).toBe(true);
  });

  it("trecho curto não casa dentro de mensagem maior", () => {
    expect(fraseConfere("pode mandar", ["certo, pode mandar o resumo"])).toBe(false);
  });

  it("frase vazia ou não-string nunca confere", () => {
    expect(fraseConfere("", [""])).toBe(false);
    expect(fraseConfere("   ", ["   "])).toBe(false);
    expect(fraseConfere(null, ["sim"])).toBe(false);
    expect(fraseConfere("sim", [])).toBe(false);
  });

  it("normalizar tira acento, caixa e espaço sobrando", () => {
    expect(normalizar("  CERTO,   Póde   Mandar  ")).toBe("certo, pode mandar");
  });
});

describe("schemas do briefing", () => {
  it("núcleo completo passa, com as marcas explícitas", () => {
    expect(nucleoDoBriefingSchema.safeParse(nucleoCompleto()).success).toBe(true);
    expect(
      nucleoDoBriefingSchema.safeParse({ ...nucleoCompleto(), referencia: "cliente_nao_sabe" }).success,
    ).toBe(true);
  });

  it("núcleo com categoria vazia ou ausente reprova", () => {
    expect(nucleoDoBriefingSchema.safeParse({ ...nucleoCompleto(), prazo: "" }).success).toBe(false);
    const semPrazo = nucleoCompleto() as Record<string, unknown>;
    delete semPrazo.prazo;
    expect(nucleoDoBriefingSchema.safeParse(semPrazo).success).toBe(false);
  });

  it("confirmação exige a frase do cliente", () => {
    expect(confirmacaoDoBriefingSchema.safeParse({ frase_do_cliente: "certo, pode mandar" }).success).toBe(true);
    expect(confirmacaoDoBriefingSchema.safeParse({}).success).toBe(false);
  });

  it("são 7 categorias, cada uma com chave, rótulo e orientação", () => {
    expect(CATEGORIAS_DO_BRIEFING).toHaveLength(7);
    for (const categoria of CATEGORIAS_DO_BRIEFING) {
      expect(categoria.chave.trim()).not.toBe("");
      expect(categoria.rotulo.trim()).not.toBe("");
      expect(categoria.orientacao.trim()).not.toBe("");
    }
  });
});
