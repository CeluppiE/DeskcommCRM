import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionCtx } from "@/lib/automation/types";

vi.mock("@/lib/tarefas/criar-tarefa", () => ({ criarTarefaInterna: vi.fn() }));

import { criarTarefaInterna } from "@/lib/tarefas/criar-tarefa";
import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/create-task";

const criar = vi.mocked(criarTarefaInterna);
const CONFIG = { titulo: "Ligar", vence_em_dias: 1, atribuir_a: "dono_do_lead", prioridade: "high" };

function ctx(): ActionCtx {
  return {
    admin: {} as ActionCtx["admin"],
    organizationId: "org-1",
    ruleId: "rule-1",
    ruleName: "Regra",
    requestId: "evt-1",
    event: {
      id: "evt-1",
      organization_id: "org-1",
      event_type: "lead.created",
      entity_kind: "crm_lead",
      entity_id: "lead-1",
      payload: {},
      metadata: {},
      consumed_by: [],
      attempts: 0,
    },
    context: { lead: { id: "lead-1" } },
  };
}

// O `status` decide se o operador vê falha de infra ou recusa de configuração:
// INSERT que não entrou é `failed`; regra sem dono é `skipped` (reenviar não adianta).
describe("create_task: status da recusa", () => {
  beforeEach(() => criar.mockReset());

  it("INSERT falho (codigo falha) vira failed com o erro", async () => {
    criar.mockResolvedValue({ ok: false, codigo: "falha", erro: "connection reset" });
    const r = await getAction("create_task")!.execute(ctx(), CONFIG);
    expect(r).toEqual({ type: "create_task", status: "failed", error: "connection reset" });
  });

  it("recusa de configuração (sem_dono) continua skipped", async () => {
    criar.mockResolvedValue({ ok: false, codigo: "sem_dono" });
    const r = await getAction("create_task")!.execute(ctx(), CONFIG);
    expect(r).toEqual({ type: "create_task", status: "skipped", detail: { reason: "sem_dono" } });
  });
});
