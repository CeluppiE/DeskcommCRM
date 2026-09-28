// lib/propostas/modelos/importar.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const runModelCall = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({ runModelCall }));

import { gerarModeloDoTexto } from "./importar";

const entrada = { texto: "Proposta para a Imobiliária Rio...", pool: {} as never, cfg: {} as never, tenantId: "org-1" };

function respondeCom(args: unknown) {
  runModelCall.mockResolvedValueOnce({ result: { toolCalls: [{ toolName: "propor_modelo", input: args }] } });
}

beforeEach(() => runModelCall.mockReset());

describe("gerarModeloDoTexto", () => {
  it("usa o ponto proposal_template_import e devolve as seções normalizadas", async () => {
    respondeCom({
      nome: "Portal imobiliário",
      secoes: [
        { id: "Resumo Geral", title: "Resumo", body: "Projeto {{project.name}} para {{client.company}}.", required: true, conditional: false },
        { id: "resumo_geral", title: "Resumo 2", body: "Outro texto.", required: false, conditional: true },
      ],
    });
    const r = await gerarModeloDoTexto(entrada);
    expect(runModelCall).toHaveBeenCalledWith(entrada.pool, entrada.cfg, expect.objectContaining({ purpose: "proposal_template_import", tenantId: "org-1" }));
    expect(r?.nome).toBe("Portal imobiliário");
    expect(r?.sections.map((s) => s.id)).toEqual(["resumo_geral", "resumo_geral_2"]);
    expect(r?.sectionOrder).toEqual(["resumo_geral", "resumo_geral_2"]);
    expect(r?.sections[0]).toMatchObject({ titleEs: null, bodyEs: null, required: true });
  });

  it("modelo que não chama a ferramenta devolve null", async () => {
    runModelCall.mockResolvedValueOnce({ result: { toolCalls: [] } });
    expect(await gerarModeloDoTexto(entrada)).toBeNull();
  });

  it("formato inesperado devolve null", async () => {
    respondeCom({ nome: 3 });
    expect(await gerarModeloDoTexto(entrada)).toBeNull();
  });

  it("o texto enviado à IA é cortado em 30.000 caracteres", async () => {
    respondeCom({ nome: "X", secoes: [{ id: "a", title: "A", body: "b", required: true, conditional: false }] });
    await gerarModeloDoTexto({ ...entrada, texto: "x".repeat(50000) });
    const mensagem = runModelCall.mock.calls[0]![2].messages[0]!.content as string;
    expect(mensagem.length).toBeLessThan(31000);
  });

  it("o sistema diz que LISTAS viram variável e que seção opcional é condicional", async () => {
    // O prompt de sistema é o contrato inteiro da importação: é ele que troca a
    // lista de páginas de UMA proposta pelo campo que muda a cada cliente. Sem
    // essa instrução o modelo importado sai com o texto da empresa inteiro
    // queimado — a tela até avisa "quase não pede nada", mas a proposta gerada
    // erra o cliente seguinte. E `conditional=true` é o que faz a seção que só
    // alguns clientes levam sumir em vez de prometer algo que não foi contratado.
    respondeCom({ nome: "X", secoes: [{ id: "a", title: "A", body: "b", required: true, conditional: false }] });
    await gerarModeloDoTexto(entrada);
    const sistema = runModelCall.mock.calls[0]![2].system as string;

    for (const caminho of ["scope.pages_list", "scope.features_list", "scope.integrations_list"]) {
      expect(sistema).toContain(`{{${caminho}}}`);
    }
    expect(sistema).toContain("conditional=true");
    expect(sistema).toContain("required=false");
  });
});
