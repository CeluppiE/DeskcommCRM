import { describe, expect, it, vi } from "vitest";
import { aplicarMudancas, gerarMudancas } from "./assistente";
import type { EstadoDaProposta } from "./assistente";

function estado(): EstadoDaProposta {
  return {
    titulo: "Site institucional", condicoes: null, valid_until: "2026-10-01",
    briefing: { project: { objective: "vender mais apartamentos" } },
    itens: [
      { id: "item-1", product_id: null, descricao: "Site institucional", quantidade: 1, preco_unitario_cents: 800000, desconto_cents: 0, position: 1000 },
      { id: "item-2", product_id: null, descricao: "Hospedagem anual", quantidade: 1, preco_unitario_cents: 120000, desconto_cents: 0, position: 2000 },
    ],
  };
}

describe("aplicarMudancas", () => {
  it("editar_item muda só o campo pedido, mais nada", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 },
    ]);
    expect(r.itens.find((i) => i.id === "item-1")?.preco_unitario_cents).toBe(720000);
    expect(r.itens.find((i) => i.id === "item-2")?.preco_unitario_cents).toBe(120000);
  });

  it("remover_item tira o item da lista", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "remover_item", item_id: "item-2", descricao: "Hospedagem anual" },
    ]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]?.id).toBe("item-1");
  });

  it("editar_proposta muda titulo/condicoes/valid_until", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_proposta", campo: "valid_until", de: "2026-10-01", para: "2026-10-31" },
    ]);
    expect(r.valid_until).toBe("2026-10-31");
  });

  it("mudanca referenciando item_id inexistente é IGNORADA, não lança", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-999", campo: "preco_unitario_cents", de: 1, para: 2 },
    ]);
    expect(r).toEqual(estado());
  });

  it("lista vazia de mudancas devolve o estado idêntico", () => {
    expect(aplicarMudancas(estado(), [])).toEqual(estado());
  });

  it("duas mudancas no MESMO item aplicam em sequência, não se pisam", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 },
      { tipo: "editar_item", item_id: "item-1", campo: "quantidade", de: 1, para: 2 },
    ]);
    const item = r.itens.find((i) => i.id === "item-1");
    expect(item?.preco_unitario_cents).toBe(720000);
    expect(item?.quantidade).toBe(2);
  });

  it("editar_briefing grava no caminho pontuado, dentro de EstadoDaProposta.briefing", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo Imobiliário" },
    ]);
    expect(r.briefing).toMatchObject({ project: { name: "Site Catálogo Imobiliário" } });
  });

  it("editar_briefing NÃO apaga campo irmão já preenchido no mesmo objeto pai (Review Focus)", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo Imobiliário" },
    ]);
    expect(r.briefing).toMatchObject({
      project: { name: "Site Catálogo Imobiliário", objective: "vender mais apartamentos" },
    });
  });

  it("duas mudancas editar_briefing em sequência não se pisam (Review Focus)", () => {
    const r = aplicarMudancas(estado(), [
      { tipo: "editar_briefing", campo: "project.name", de: null, para: "Site Catálogo" },
      { tipo: "editar_briefing", campo: "client.company_or_name", de: null, para: "Imobiliária Acme" },
    ]);
    expect(r.briefing).toMatchObject({
      project: { name: "Site Catálogo", objective: "vender mais apartamentos" },
      client: { company_or_name: "Imobiliária Acme" },
    });
  });

  it("editar_briefing num caminho de 1 nível só (sem ponto) também funciona", () => {
    const r = aplicarMudancas(estado(), [{ tipo: "editar_briefing", campo: "segmento", de: null, para: "imobiliário" }]);
    expect(r.briefing.segmento).toBe("imobiliário");
  });
});

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent-engine/edge/llm/run-model-call")>();
  return { ...real, runModelCall: vi.fn() };
});

describe("gerarMudancas", () => {
  it("monta a chamada com tenantId/purpose corretos e devolve o argumento da tool-call", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: {
        toolCalls: [{
          toolName: "propor_mudancas",
          input: { mudancas: [{ tipo: "editar_item", item_id: "item-1", campo: "preco_unitario_cents", de: 800000, para: 720000 }], nao_entendido: null },
        }],
      },
    } as never);

    const r = await gerarMudancas({
      instrucao: "baixa 10% no site", estado: estado(),
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });

    expect(r.mudancas).toHaveLength(1);
    expect(vi.mocked(runModelCall)).toHaveBeenCalledWith(
      {}, {}, expect.objectContaining({ tenantId: "org-1", purpose: "proposal_assistant" }),
    );
  });

  it("modelo não chama a tool (instrucao ambigua): mudancas vazia, nao_entendido preenchido", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({ result: { toolCalls: [] } } as never);

    const r = await gerarMudancas({
      instrucao: "manda para o financeiro", estado: estado(),
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });
    expect(r.mudancas).toHaveLength(0);
    expect(r.nao_entendido).not.toBeNull();
  });

  it("orcamento estourado: o erro de runModelCall SOBE, não é engolido aqui", async () => {
    const { runModelCall, LlmBudgetExceededError } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockRejectedValue(new LlmBudgetExceededError());

    await expect(gerarMudancas({
      instrucao: "baixa 10%", estado: estado(), pool: {} as never, cfg: {} as never, tenantId: "org-1",
    })).rejects.toThrow(/orçamento/);
  });

  it("item sem preço aparece como 'a definir' no prompt, nunca R$ 0,00 (§5.2)", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({ result: { toolCalls: [] } } as never);

    const est = estado();
    est.itens[0]!.preco_unitario_cents = null;
    await gerarMudancas({
      instrucao: "x", estado: est,
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });

    const opts = vi.mocked(runModelCall).mock.calls.at(-1)?.[2] as { messages: Array<{ content: unknown }> };
    const prompt = opts.messages.map((m) => String(m.content)).join("\n");
    expect(prompt).toContain("× a definir");
    expect(prompt).not.toContain("× R$ 0.00");
  });
});
