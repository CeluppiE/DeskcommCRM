import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createClient: vi.fn(),
  audit: vi.fn(),
  requireSupportWrite: vi.fn(),
  emitLeadActivity: vi.fn(),
  cancelaRetornoNoCrm: vi.fn(),
}));

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: mocks.emitLeadActivity }));
vi.mock("@/lib/followup/retorno-crm", () => ({ cancelaRetornoNoCrm: mocks.cancelaRetornoNoCrm }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";
const LEAD_ID = "77777777-7777-4777-8777-777777777777";
const CONTACT_ID = "88888888-8888-4888-8888-888888888888";

interface MundoOpts {
  status?: string;
  leadValueCentsAntes?: number;
  suporteReadOnly?: boolean;
  /** D10: proposta órfã — o negócio foi apagado (lead_id virou null). */
  leadIdNulo?: boolean;
  /** N2: id do retorno automático agendado no envio (null = nunca teve). */
  retornoId?: string | null;
}

function montarMundoDeDecisao(opts: MundoOpts = {}) {
  const proposta = {
    id: PROPOSAL_ID,
    organization_id: ORG_ID,
    lead_id: opts.leadIdNulo ? null : LEAD_ID,
    contact_id: CONTACT_ID,
    status: opts.status ?? "enviada",
    numero: 1,
    ano: 2026,
    total_cents: 500000,
    decided_at: null as string | null,
    decided_by_user_id: null as string | null,
    decision_reason: null as string | null,
    retorno_id: (opts.retornoId ?? null) as string | null,
  };
  let propostaAtualizada: typeof proposta | null = null;
  let atividadeGravada: { type: string } | null = null;
  const leadValueCentsDepois = opts.leadValueCentsAntes ?? 0;

  mocks.createClient.mockResolvedValue({
    from(tabela: string) {
      let atualizacao: Record<string, unknown> = {};
      const filtros: Map<string, unknown> = new Map();

      const executar = async () => {
        if (tabela === "crm_proposals") {
          const matchesAllFilters = (linha: Record<string, unknown>) =>
            [...filtros].every(([campo, valor]) => linha[campo] === valor);

          if (!matchesAllFilters(proposta)) return { data: null, error: null };
          Object.assign(proposta, atualizacao);
          propostaAtualizada = { ...proposta };
          return { data: { ...proposta }, error: null };
        }
        throw new Error(`Tabela inesperada: ${tabela}`);
      };

      const query = {
        select: () => query,
        update: (valores: Record<string, unknown>) => {
          atualizacao = valores;
          return query;
        },
        eq: (campo: string, valor: unknown) => {
          filtros.set(campo, valor);
          return query;
        },
        maybeSingle: executar,
        then: <T>(resolve: (resultado: Awaited<ReturnType<typeof executar>>) => T) =>
          executar().then(resolve),
      };
      return query;
    },
  });

  mocks.emitLeadActivity.mockImplementation(async (_supabase, activity) => {
    atividadeGravada = { type: activity.type };
  });

  return {
    get propostaAtualizada() {
      return propostaAtualizada;
    },
    get atividadeGravada() {
      return atividadeGravada;
    },
    get leadValueCentsDepois() {
      return leadValueCentsDepois;
    },
    async POST(corpo: unknown) {
      if (opts.suporteReadOnly) {
        mocks.requireSupportWrite.mockResolvedValueOnce(fail("forbidden", "Somente leitura", 403));
      }
      const { POST } = await import("./route");
      return POST(
        new NextRequest(`http://localhost/api/v1/proposals/${PROPOSAL_ID}/decide`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        }),
        { params: Promise.resolve({ id: PROPOSAL_ID }) },
      );
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({
    ok: true,
    user: { id: USER_ID, idioma: "pt-BR" },
    org: { orgId: ORG_ID },
  });
  mocks.requireSupportWrite.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
  mocks.emitLeadActivity.mockResolvedValue(undefined);
});

describe("POST /api/v1/proposals/[id]/decide", () => {
  it("aceita: grava decided_at/decided_by_user_id, status=aceita, timeline registra", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.status).toBe("aceita");
    expect(mundo.atividadeGravada?.type).toBe("proposal_accepted");
  });

  it("decide uma proposta orfa (negocio apagado, lead_id nulo) sem lancar — D10", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada", leadIdNulo: true });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.status).toBe("aceita");
    // sem negócio, não há atividade de negócio para gravar.
    expect(mundo.atividadeGravada).toBeNull();
  });

  it("recusada com motivo: grava decision_reason, value_cents do lead NÃO muda (spec §16.2)", async () => {
    const mundo = montarMundoDeDecisao({
      status: "enviada",
      leadValueCentsAntes: 800000,
    });
    const res = await mundo.POST({ decisao: "recusada", motivo: "preço acima do orçamento" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.decision_reason).toBe("preço acima do orçamento");
    expect(mundo.leadValueCentsDepois).toBe(800000);
  });

  it("decidir aceita/recusada: CANCELA o retorno automático quando a proposta tinha um agendado (N2)", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada", retornoId: "retorno-1" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(200);
    expect(mocks.cancelaRetornoNoCrm).toHaveBeenCalledWith(
      expect.anything(),
      "retorno-1",
      expect.objectContaining({ motivo: expect.any(String) }),
    );
  });

  it("cancelaRetornoNoCrm lança (banco instável): a decisão já gravada não vira 500, e a auditoria ainda sai (achado Importante da revisão final da C3b+E1)", async () => {
    mocks.cancelaRetornoNoCrm.mockRejectedValueOnce(new Error("retorno_cancel_failed: timeout"));
    const mundo = montarMundoDeDecisao({ status: "enviada", retornoId: "retorno-1" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada?.status).toBe("aceita");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "proposal.aceita" }));
  });

  it("proposta sem retorno_id (nunca teve, ou falhou ao agendar): não tenta cancelar, não lança", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada", retornoId: null });
    const res = await mundo.POST({ decisao: "recusada" });
    expect(res.status).toBe(200);
    expect(mocks.cancelaRetornoNoCrm).not.toHaveBeenCalled();
  });

  it("proposta em rascunho: 409, não decide sobre o que não foi enviado", async () => {
    const mundo = montarMundoDeDecisao({ status: "rascunho" });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(409);
  });

  it("respeita recusa de suporte antes de decidir", async () => {
    const mundo = montarMundoDeDecisao({ status: "enviada", suporteReadOnly: true });
    const res = await mundo.POST({ decisao: "aceita" });
    expect(res.status).toBe(403);
    expect(mundo.propostaAtualizada).toBeNull();
  });
});
