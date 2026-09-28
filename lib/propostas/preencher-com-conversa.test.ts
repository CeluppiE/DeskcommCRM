import { describe, expect, it, vi } from "vitest";
import { montarTranscricao, sugerirValoresDaConversa } from "./preencher-com-conversa";
import type { CampoParaSugestao } from "./preencher-com-conversa";

describe("montarTranscricao", () => {
  it("rotula inbound como Cliente e outbound como Atendente, na ordem em que vieram", () => {
    const t = montarTranscricao([
      { direction: "inbound", body: "Quero um site para minha imobiliária" },
      { direction: "outbound", body: "Claro! Qual o objetivo principal do site?" },
      { direction: "inbound", body: "Gerar contato de comprador" },
    ]);
    expect(t).toBe(
      "Cliente: Quero um site para minha imobiliária\nAtendente: Claro! Qual o objetivo principal do site?\nCliente: Gerar contato de comprador",
    );
  });

  it("mensagem sem corpo (mídia sem transcrição) é pulada, nunca vira linha vazia", () => {
    const t = montarTranscricao([
      { direction: "inbound", body: null },
      { direction: "inbound", body: "  " },
      { direction: "outbound", body: "Oi!" },
    ]);
    expect(t).toBe("Atendente: Oi!");
  });

  it("lista vazia devolve string vazia", () => {
    expect(montarTranscricao([])).toBe("");
  });
});

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent-engine/edge/llm/run-model-call")>();
  return { ...real, runModelCall: vi.fn() };
});

const CAMPOS: CampoParaSugestao[] = [
  { caminho: "project.objective", rotulo: "Objetivo do projeto" },
  { caminho: "scope.pages_list", rotulo: "Lista de páginas" },
];

describe("sugerirValoresDaConversa", () => {
  it("monta a chamada com tenantId/purpose corretos e devolve as sugestões da tool-call", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: {
        toolCalls: [{
          toolName: "sugerir_valores",
          input: { sugestoes: [{ campo: "project.objective", valor: "Gerar contato de comprador" }] },
        }],
      },
    } as never);

    const r = await sugerirValoresDaConversa({
      campos: CAMPOS, transcricao: "Cliente: quero gerar contatos",
      pool: {} as never, cfg: {} as never, tenantId: "org-1",
    });

    expect(r).toEqual([{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Gerar contato de comprador" }]);
    expect(vi.mocked(runModelCall)).toHaveBeenCalledWith(
      {}, {}, expect.objectContaining({ tenantId: "org-1", purpose: "proposal_fill_from_conversation" }),
    );
  });

  it("campo fora da lista pedida (alucinação) é descartado — nunca sai da função", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: { toolCalls: [{ toolName: "sugerir_valores", input: { sugestoes: [
        { campo: "project.objective", valor: "Vender apartamentos" },
        { campo: "client.bank_account", valor: "12345-6" },
      ] } }] },
    } as never);

    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([{ campo: "project.objective", rotulo: "Objetivo do projeto", valor: "Vender apartamentos" }]);
  });

  it("valor vazio ou só espaço é descartado", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({
      result: { toolCalls: [{ toolName: "sugerir_valores", input: { sugestoes: [
        { campo: "project.objective", valor: "   " },
        { campo: "scope.pages_list", valor: "Home, Sobre, Contato" },
      ] } }] },
    } as never);

    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([{ campo: "scope.pages_list", rotulo: "Lista de páginas", valor: "Home, Sobre, Contato" }]);
  });

  it("modelo não chama a tool: devolve lista vazia, nunca lança", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockResolvedValue({ result: { toolCalls: [] } } as never);
    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
  });

  it("sem campos pedidos, nem chama o modelo — economiza orçamento", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockClear();
    const r = await sugerirValoresDaConversa({ campos: [], transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
    expect(runModelCall).not.toHaveBeenCalled();
  });

  it("sem transcrição, nem chama o modelo — nada para ler", async () => {
    const { runModelCall } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockClear();
    const r = await sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "   ", pool: {} as never, cfg: {} as never, tenantId: "org-1" });
    expect(r).toEqual([]);
    expect(runModelCall).not.toHaveBeenCalled();
  });

  it("orçamento estourado: o erro de runModelCall SOBE, não é engolido aqui", async () => {
    const { runModelCall, LlmBudgetExceededError } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    vi.mocked(runModelCall).mockRejectedValue(new LlmBudgetExceededError());
    await expect(
      sugerirValoresDaConversa({ campos: CAMPOS, transcricao: "x", pool: {} as never, cfg: {} as never, tenantId: "org-1" }),
    ).rejects.toThrow();
  });
});
