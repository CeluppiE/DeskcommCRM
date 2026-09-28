// lib/propostas/orcamento-de-ia-disponivel.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { orcamentoDeIaDisponivel } from "./orcamento-de-ia-disponivel";

interface MundoOpts {
  /** Linha de ai_budgets. `undefined` = sem linha (maybeSingle null). `"erro"` = a query lança. */
  orcamento?: Record<string, unknown> | "erro" | undefined;
  /** Gasto devolvido pelo rpc (pode ser number ou string numérica, como o PostgREST devolve numeric). */
  gasto?: number | string;
  /** "erro" = o rpc lança. */
  gastoErro?: boolean;
  /** Já houve budget_warning neste mês. */
  avisadoNesteMes?: boolean;
}

function montarDb(opts: MundoOpts = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    from: vi.fn((tabela: string) => {
      if (tabela === "ai_budgets") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (opts.orcamento === "erro") throw new Error("db fora do ar");
                if (opts.orcamento === undefined) return { data: null, error: null };
                return { data: opts.orcamento, error: null };
              },
            }),
          }),
        };
      }
      if (tabela === "agent_inbox_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => ({ data: opts.avisadoNesteMes ? [{ id: "aviso-1" }] : [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela não mockada: ${tabela}`);
    }),
    rpc: vi.fn(async (fn: string, _args: unknown) => {
      expect(fn).toBe("fn_gasto_de_ia_do_mes");
      if (opts.gastoErro) throw new Error("permission denied");
      return { data: opts.gasto ?? 0, error: null };
    }),
  };
  return db;
}

const ORCAMENTO_HARD = {
  monthly_limit_cents: 10000,
  enforcement_mode: "bloquear",
  enforcement_effective_at: "2026-01-01T00:00:00Z",
  alarm_threshold_pct: 80,
};

describe("orcamentoDeIaDisponivel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("modo 'off' ou sem linha em ai_budgets: sempre disponível", async () => {
    expect(await orcamentoDeIaDisponivel(montarDb(), "org-1")).toEqual({ disponivel: true, motivo: null });
    const dbOff = montarDb({ orcamento: { ...ORCAMENTO_HARD, enforcement_mode: "off" }, gasto: 999999 });
    expect(await orcamentoDeIaDisponivel(dbOff, "org-1")).toEqual({ disponivel: true, motivo: null });
  });

  it("gasto abaixo do teto: disponível", async () => {
    const db = montarDb({ orcamento: ORCAMENTO_HARD, gasto: 5000, avisadoNesteMes: true });
    expect(await orcamentoDeIaDisponivel(db, "org-1")).toEqual({ disponivel: true, motivo: null });
  });

  it("gasto ACIMA do teto com enforcement 'bloquear' e aviso já dado no mês: indisponível, com motivo legível para leigo", async () => {
    const db = montarDb({ orcamento: ORCAMENTO_HARD, gasto: 15000, avisadoNesteMes: true });
    const r = await orcamentoDeIaDisponivel(db, "org-1");
    expect(r.disponivel).toBe(false);
    expect(r.motivo).toContain("orçamento mensal de IA");
  });

  it("acima do teto mas SEM aviso no mês: disponível (ninguém é bloqueado sem ter sido avisado)", async () => {
    const db = montarDb({ orcamento: ORCAMENTO_HARD, gasto: 15000, avisadoNesteMes: false });
    expect(await orcamentoDeIaDisponivel(db, "org-1")).toEqual({ disponivel: true, motivo: null });
  });

  it("erro ao consultar (banco fora, RLS, rpc negado): degrada para DISPONÍVEL, nunca lança (falha aberta)", async () => {
    expect(await orcamentoDeIaDisponivel(montarDb({ orcamento: "erro" }), "org-1")).toEqual({
      disponivel: true, motivo: null,
    });
    expect(await orcamentoDeIaDisponivel(montarDb({ orcamento: ORCAMENTO_HARD, gastoErro: true }), "org-1")).toEqual({
      disponivel: true, motivo: null,
    });
    await expect(orcamentoDeIaDisponivel(montarDb({ orcamento: "erro" }), "org-1")).resolves.toEqual({
      disponivel: true, motivo: null,
    });
  });

  it("o purpose passado chega a decidirOrcamento: purpose isento não bloqueia mesmo acima do teto", async () => {
    const db = montarDb({ orcamento: ORCAMENTO_HARD, gasto: 15000, avisadoNesteMes: true });
    expect(await orcamentoDeIaDisponivel(db, "org-1", "on", "connection_test")).toEqual({
      disponivel: true, motivo: null,
    });
  });

  it("sem o 4º argumento, o purpose cai no default proposal_assistant (bloqueia acima do teto)", async () => {
    const db = montarDb({ orcamento: ORCAMENTO_HARD, gasto: 15000, avisadoNesteMes: true });
    const r = await orcamentoDeIaDisponivel(db, "org-1");
    expect(r.disponivel).toBe(false);
  });
});
