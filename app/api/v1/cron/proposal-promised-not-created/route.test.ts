import { describe, expect, it } from "vitest";
import { encontrarPromessasSemProposta } from "./route";

describe("encontrarPromessasSemProposta", () => {
  it("tarefa promised_proposal vencida, sem proposta criada depois dela: sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      {
        tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }],
        propostas: [],
        orgsLigadas: new Set(["org-1"]),
      },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(1);
  });

  it("tarefa vencida, MAS já existe proposta criada depois dela para o mesmo lead: não sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      {
        tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }],
        propostas: [{ id: "p1", organization_id: "org-1", lead_id: "l1", created_at: "2026-08-26T00:00:00Z" }],
        orgsLigadas: new Set(["org-1"]),
      },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("tarefa ainda não vencida: não sinaliza", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-12-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [], orgsLigadas: new Set(["org-1"]) },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("source_kind diferente (promised_followup): não sinaliza — não é sobre proposta", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: "l1", source_kind: "promised_followup", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [], orgsLigadas: new Set(["org-1"]) },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("tarefa sem lead_id (negócio ambíguo na hora de criar): não sinaliza — não há onde apontar o aviso", () => {
    const r = encontrarPromessasSemProposta(
      { tarefas: [{ id: "t1", organization_id: "org-1", lead_id: null, source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }], propostas: [], orgsLigadas: new Set(["org-1"]) },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("organização com propostas desligadas: não sinaliza, mesmo vencida", () => {
    const r = encontrarPromessasSemProposta(
      {
        tarefas: [{ id: "t1", organization_id: "org-off", lead_id: "l1", source_kind: "promised_proposal", due_date: "2026-09-01T00:00:00Z", status: "pending", created_at: "2026-08-25T00:00:00Z" }],
        propostas: [],
        orgsLigadas: new Set(["org-on"]),
      },
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });
});
