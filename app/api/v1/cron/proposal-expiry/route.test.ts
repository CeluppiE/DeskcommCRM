import { describe, expect, it } from "vitest";
import { encontrarPropostasVencidas } from "./route";

const FUSOS = new Map<string, string>();

describe("encontrarPropostasVencidas", () => {
  it("proposta enviada com valid_until no passado: vencida", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
      FUSOS,
    );
    expect(r).toHaveLength(1);
  });

  it("valid_until no futuro: não vence", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: "2026-12-01" }],
      new Date("2026-09-17"),
      FUSOS,
    );
    expect(r).toHaveLength(0);
  });

  it("status já decidido (aceita/recusada): não vence de novo", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "aceita", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
      FUSOS,
    );
    expect(r).toHaveLength(0);
  });

  it("valid_until nulo: nunca vence (rascunho sem prazo definido não deveria chegar aqui, mas se chegar, não quebra)", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: null }],
      new Date("2026-09-17"),
      FUSOS,
    );
    expect(r).toHaveLength(0);
  });

  it("duas organizações em fusos diferentes: 'hoje' é calculado POR ORGANIZAÇÃO, não globalmente (D8)", () => {
    // 2026-06-16T02:00:00Z: já é 15/06 às 23h em America/Sao_Paulo (UTC-3),
    // mas já é 16/06 em Europe/Lisbon (verão europeu, UTC+1 => 03h).
    const agora = new Date("2026-06-16T02:00:00Z");
    const fusoPorOrganizacao = new Map([["org-sp", "America/Sao_Paulo"], ["org-lisboa", "Europe/Lisbon"]]);
    const propostas = [
      { id: "p1", organization_id: "org-sp", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: "2026-06-15" },
      { id: "p2", organization_id: "org-lisboa", lead_id: "l2", contact_id: "c2", status: "enviada", valid_until: "2026-06-15" },
    ];
    const vencidas = encontrarPropostasVencidas(propostas, agora, fusoPorOrganizacao);
    // org-sp: "hoje" ainda é 15/06 lá — a proposta NÃO venceu ainda.
    // org-lisboa: "hoje" já é 16/06 lá — a proposta VENCEU.
    expect(vencidas.map((p) => p.id)).toEqual(["p2"]);
  });
});
