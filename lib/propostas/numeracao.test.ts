import { describe, expect, it, vi } from "vitest";

import { alocarNumero } from "./numeracao";

function mundo(opts: { numero?: number; rpcError?: { message: string } | null; updateError?: { code?: string; message: string } | null; fuso?: string | null }) {
  const rpc = vi.fn(async () =>
    opts.rpcError ? { data: null, error: opts.rpcError } : { data: opts.numero ?? 7, error: null },
  );
  const single = vi.fn(async () =>
    opts.updateError
      ? { data: null, error: opts.updateError }
      : { data: { id: "prop-1", numero: opts.numero ?? 7, ano: new Date().getFullYear() }, error: null },
  );
  const admin = {
    rpc,
    from: (tabela: string) => {
      if (tabela === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { timezone: opts.fuso ?? "America/Sao_Paulo" }, error: null }),
            }),
          }),
        };
      }
      return {
        update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ single }) }) }) }) }),
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof alocarNumero>[0], rpc, single };
}

describe("alocarNumero", () => {
  it("chama o contador UMA vez e devolve numero/ano", async () => {
    const { admin, rpc } = mundo({ numero: 7 });
    const r = await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" });
    expect(r.numero).toBe(7);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do contador (rpc) propaga sem retry", async () => {
    const { admin, rpc } = mundo({ rpcError: { message: "contador indisponível" } });
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toEqual({
      message: "contador indisponível",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do UPDATE (mesmo 23505) propaga sem retry — o contador não permite mais colisão de numero", async () => {
    const { admin, rpc } = mundo({ updateError: { code: "23505", message: "boom" } });
    await expect(alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1" })).rejects.toEqual({
      code: "23505",
      message: "boom",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("usa o ANO NO FUSO DA ORGANIZAÇÃO para chamar o contador, não o ano UTC (D8)", async () => {
    // Instante fixo perto da virada: 2026-01-01T01:30:00Z ainda é 2025-12-31
    // em America/Sao_Paulo (UTC-3) — o ano no fuso é 2025, não 2026.
    // (O plano sugeria 2027-01-01T01:30Z esperando 2026 — mas 2026 é também o
    // ano do relógio de hoje, e o código antigo (que ignora `agora`) passaria
    // por acaso; com 2025 o teste distingue de verdade em qualquer ano.)
    // mock organizations.timezone = "America/Sao_Paulo"
    const { admin, rpc } = mundo({ fuso: "America/Sao_Paulo" });
    const agora = new Date("2026-01-01T01:30:00Z");
    await alocarNumero(admin, { orgId: "org-1", propostaId: "prop-1", agora });
    expect(rpc).toHaveBeenCalledWith("fn_proposta_aloca_numero", expect.objectContaining({ p_ano: 2025 }));
  });
});
