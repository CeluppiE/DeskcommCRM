/**
 * A ferramenta `crm_draft_proposal` só chega ao turno com as DUAS chaves
 * ligadas: a da ORGANIZAÇÃO (`settings.proposals.enabled`, D1) e a da VERSÃO
 * DO AGENTE (`proposal_ai_draft_enabled`, D2). Antes, a da organização não era
 * lida por ninguém, e a do agente só impedia o ACRÉSCIMO automático — vinda
 * pelo pacote `vender`, a ferramenta passava com a chave desligada.
 */
import { describe, expect, it, vi } from "vitest";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import { deCapacidadeDesligada, catalogEntry } from "@/lib/mcp/tools/catalog";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const DRAFT = "crm_draft_proposal";

function contexto() {
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
  return { ctx, auth };
}

function montar(opts: { toolIds: string[]; draft?: boolean; capacidades?: "propostas"[] }) {
  const { ctx, auth } = contexto();
  return pickToolsFromMcp({
    supabase: ctx.supabase,
    ctx,
    auth,
    toolIds: opts.toolIds,
    handoffToolEnabled: false,
    proposalAiDraftEnabled: opts.draft,
    capacidadesLigadas: opts.capacidades,
    handoffSignal: { triggered: false },
  });
}

describe("o catálogo declara a capacidade", () => {
  it("crm_draft_proposal pertence à capacidade propostas", () => {
    expect(catalogEntry(DRAFT)?.capacidade).toBe("propostas");
  });
  it("deCapacidadeDesligada: desligada sem a capacidade, ligada com ela, neutra para quem não declara", () => {
    expect(deCapacidadeDesligada(DRAFT, [])).toBe(true);
    expect(deCapacidadeDesligada(DRAFT, ["propostas"])).toBe(false);
    expect(deCapacidadeDesligada("crm_search_contacts", [])).toBe(false);
  });
});

describe("o turno do agente", () => {
  it("as duas chaves ligadas: a ferramenta chega (controle positivo)", () => {
    expect(montar({ toolIds: [], draft: true, capacidades: ["propostas"] })).toHaveProperty(DRAFT);
  });
  it("organização desligada: não chega, nem pelo acréscimo automático", () => {
    expect(montar({ toolIds: [], draft: true, capacidades: [] })).not.toHaveProperty(DRAFT);
  });
  it("organização desligada: não chega nem marcada na versão publicada", () => {
    expect(montar({ toolIds: [DRAFT], draft: true, capacidades: [] })).not.toHaveProperty(DRAFT);
  });
  it("capacidades AUSENTES valem como nenhuma", () => {
    expect(montar({ toolIds: [DRAFT], draft: true })).not.toHaveProperty(DRAFT);
  });
  it("D2: chave do agente desligada tira a ferramenta vinda do pacote", () => {
    expect(montar({ toolIds: [DRAFT], draft: false, capacidades: ["propostas"] })).not.toHaveProperty(DRAFT);
  });
  it("D2: chave do agente ausente também tira", () => {
    expect(montar({ toolIds: [DRAFT], capacidades: ["propostas"] })).not.toHaveProperty(DRAFT);
  });
  it("as outras ferramentas não são afetadas", () => {
    expect(montar({ toolIds: ["crm_search_contacts"], capacidades: [] })).toHaveProperty("crm_search_contacts");
  });
});

describe("o handler recusa sozinho (cliente MCP externo que chama direto)", () => {
  it("organização desligada: devolve erro e não escreve", async () => {
    const { crmDraftProposal } = await import("@/lib/mcp/tools/propostas");
    const insert = vi.fn();
    const supabase = {
      from: vi.fn((tabela: string) => {
        if (tabela === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { settings: { proposals: { enabled: false } } }, error: null }),
              }),
            }),
          };
        }
        return { insert, select: vi.fn(), eq: vi.fn() };
      }),
    };
    const { ctx } = contexto();
    const r = await crmDraftProposal.handler(
      {
        lead_id: "22222222-2222-4222-8222-222222222222",
        titulo: "X",
        conversation_id: "33333333-3333-4333-8333-333333333333",
        itens: [{ descricao: "a", quantidade: 1, preco_unitario_cents: 100 }],
      },
      { ...ctx, supabase } as never,
    );
    expect(r).toEqual({ error: "Propostas estão desligadas nesta organização." });
    expect(insert).not.toHaveBeenCalled();
  });
});
