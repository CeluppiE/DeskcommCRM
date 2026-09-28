/**
 * O Operador NÃO rascunha proposta — só o Conversador (medido na VPS em
 * 2026-09-27: o rascunho nascia na primeira mensagem do cliente, e quem o
 * criava era o Operador, que não lê o roteiro do agente nem a conversa).
 *
 * Três pontas, cada uma com controle positivo:
 * 1. a mão do Operador, montada pelo MESMO `pickToolsFromMcp` do runtime, não
 *    tem `crm_draft_proposal` — nem marcada, nem pelo acréscimo da chave;
 * 2. o turno do Operador monta a mão por `maoDoOperador`, e não pela lista crua;
 * 3. a tela do Operador não oferece a caixa (nem conta a salva no teto).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import { FORA_DO_OPERADOR, maoDoOperador } from "@/lib/agent-engine/agent/entrega-de-capacidade";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ToolPicker } from "@/app/app/ai/agents/[id]/_components/ToolPicker";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

const ORG = "11111111-1111-4111-8111-111111111111";
const DRAFT = "crm_draft_proposal";
const BUSCA = "crm_search_contacts";

function montar(cfg: { toolIds: string[]; proposalAiDraftEnabled: boolean }) {
  const ctx = {
    organizationId: ORG,
    role: "ai_operator",
    actor: { type: "ai_agent", id: "agente-1", role: "ai_operator" },
    apiTokenId: "tok-1",
    requestId: "run-1",
    supabase: {} as never,
  } as unknown as McpContext;
  const auth = {
    organizationId: ORG,
    role: "ai_operator",
    actor: ctx.actor,
    apiTokenId: "tok-1",
    scopes: ["mcp:read", "mcp:write", "actor:ai_agent", "role:ai_operator"],
  } as unknown as McpAuthResult;
  return pickToolsFromMcp({
    supabase: ctx.supabase,
    ctx,
    auth,
    toolIds: cfg.toolIds,
    handoffToolEnabled: false,
    proposalAiDraftEnabled: cfg.proposalAiDraftEnabled,
    capacidadesLigadas: ["propostas"],
    handoffSignal: { triggered: false },
  });
}

/** A versão publicada do caso da VPS: chave ligada, proposta marcada nos dois papéis. */
const VERSAO = {
  toolIds: [BUSCA, DRAFT],
  operatorToolIds: [BUSCA, DRAFT],
  proposalAiDraftEnabled: true,
};

describe("a mão do Operador", () => {
  it("controle: o Conversador, com a mesma versão, recebe a ferramenta", () => {
    expect(montar(VERSAO)).toHaveProperty(DRAFT);
  });

  it("marcada na lista do Operador: não chega", () => {
    const mao = montar(maoDoOperador(VERSAO));
    expect(mao).not.toHaveProperty(DRAFT);
    expect(mao, "o resto da lista dele continua").toHaveProperty(BUSCA);
  });

  it("fora da lista, com a chave ligada: o acréscimo automático também não chega", () => {
    expect(montar(maoDoOperador({ ...VERSAO, operatorToolIds: [BUSCA] }))).not.toHaveProperty(DRAFT);
  });

  it("não mexe na versão recebida (o Conversador segue lendo a dele)", () => {
    const versao = { ...VERSAO, operatorToolIds: [...VERSAO.operatorToolIds] };
    maoDoOperador(versao);
    expect(versao.operatorToolIds).toContain(DRAFT);
    expect(versao.proposalAiDraftEnabled).toBe(true);
  });
});

describe("o turno do Operador usa a mão filtrada", () => {
  const fonte = readFileSync(
    join(process.cwd(), "lib/agent-engine/agent/operator-turn.ts"),
    "utf8",
  );
  it("monta as ferramentas com maoDoOperador, nunca com a lista crua", () => {
    expect(fonte).toContain("const mao = maoDoOperador(agentConfig);");
    // A decisão de chamar o modelo lê a mão FILTRADA: com só a proposta
    // marcada, o Operador não gasta uma chamada sem ferramenta nenhuma.
    expect(fonte).toContain("if (mao.toolIds.length > 0)");
    expect(fonte).not.toMatch(/toolIds:\s*agentConfig\.operatorToolIds/);
  });
});

describe("a tela do Operador", () => {
  const meta = (id: string, rotulo: string) => ({
    id,
    description: rotulo,
    category: "write",
    requires_role: "agent",
    requires_scope: "mcp:write",
    rotulo,
    explicacao: rotulo,
    o_que_toca: rotulo,
    risco: "seguro",
    pacotes: ["vender"],
    marcavel: true,
    motivo_nao_marcavel: null,
  });

  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.get.mockResolvedValue({
      data: {
        tools: [meta(BUSCA, "Buscar contatos"), meta(DRAFT, "Rascunhar proposta")],
        desligadas_pela_organizacao: [],
      },
    });
  });
  afterEach(() => {
    cleanup();
    client.clear();
  });

  function abrir(ocultar?: readonly string[]) {
    return render(
      <IdiomaProvider locale="pt-BR">
        <QueryClientProvider client={client}>
          <ToolPicker value={[BUSCA, DRAFT]} onChange={() => undefined} ocultar={ocultar} />
        </QueryClientProvider>
      </IdiomaProvider>,
    );
  }

  it("controle: sem ocultar, a proposta salva conta no teto", async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId("consumo-teto").textContent).toMatch(/^2 /));
  });

  it("com FORA_DO_OPERADOR, a proposta não conta, nem vira 'capacidade que não existe mais'", async () => {
    abrir(FORA_DO_OPERADOR);
    await waitFor(() => expect(screen.getByTestId("consumo-teto").textContent).toMatch(/^1 /));
    expect(screen.queryByTestId("capacidades-orfas")).toBeNull();
    expect(screen.queryByText("Rascunhar proposta")).toBeNull();
  });
});
