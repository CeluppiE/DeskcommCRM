import { describe, expect, it } from "vitest";
import { calcularProntidao, type EntradaDeProntidao } from "./prontidao";

const TUDO_OK: EntradaDeProntidao = {
  temContato: true,
  temEscopo: true,
  temPrazo: true,
  temPrecoDefinido: true,
  temPagamento: true,
  temValidade: true,
  temConteudoCompleto: true,
};

describe("calcularProntidao — nunca promove a pronta_para_envio faltando um item", () => {
  it("tudo presente: pronta_para_envio, checklist inteiro true", () => {
    const r = calcularProntidao(TUDO_OK);
    expect(r.status).toBe("pronta_para_envio");
    expect(Object.values(r.checklist).every(Boolean)).toBe(true);
  });

  it("falta só o prazo: NÃO fica pronta_para_envio (Review Focus — um item barra o total)", () => {
    const r = calcularProntidao({ ...TUDO_OK, temPrazo: false });
    expect(r.status).not.toBe("pronta_para_envio");
    expect(r.checklist.prazo).toBe(false);
  });

  it("falta contato ou escopo (o básico): incompleta, não pronta_para_revisao", () => {
    expect(calcularProntidao({ ...TUDO_OK, temContato: false }).status).toBe("incompleta");
    expect(calcularProntidao({ ...TUDO_OK, temEscopo: false }).status).toBe("incompleta");
  });

  it("tem o básico (contato+escopo) mas falta algo de envio: pronta_para_revisao", () => {
    const r = calcularProntidao({ ...TUDO_OK, temPagamento: false });
    expect(r.status).toBe("pronta_para_revisao");
  });
});
