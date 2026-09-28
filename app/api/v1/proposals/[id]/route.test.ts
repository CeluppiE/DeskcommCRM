import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createClient: vi.fn(),
  audit: vi.fn(),
  requireSupportWrite: vi.fn(),
  resolverAvisoDeRevisaoSeProntaOuEncerrada: vi.fn(),
}));

vi.mock("@/lib/propostas/porta", () => ({ sePropostasDesligadas: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.requireSupportWrite }));
vi.mock("@/lib/propostas/aviso-de-revisao", () => ({ resolverAvisoDeRevisaoSeProntaOuEncerrada: mocks.resolverAvisoDeRevisaoSeProntaOuEncerrada }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";
const PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_PROPOSAL_ID = "55555555-5555-4555-8555-555555555555";
const ITEM_ID = "66666666-6666-4666-8666-666666666666";
const PRODUCT_ID = "77777777-7777-4777-8777-777777777777";
const PRODUCT_INEXISTENTE = "88888888-8888-4888-8888-888888888888";
const item = {
  product_id: null,
  descricao: "Site",
  quantidade: 1,
  preco_unitario_cents: 700000,
  desconto_cents: 0,
  position: 1000,
};

type Linha = Record<string, unknown>;
type Operacao = "select" | "update" | "delete" | "insert";
interface Consulta {
  tabela: string;
  operacao: Operacao;
  filtros: Map<string, unknown>;
}
interface MundoOpts {
  revisionAtual?: number;
  status?: string;
  outraOrg?: boolean;
  ausente?: boolean;
  falha?: "proposta.select" | "proposta.update" | "itens.select" | "itens.delete" | "itens.insert";
  /** Preço que o mock de catalog_products devolve; null = produto não resolve. */
  precoDoCatalogo?: number | null;
  /** Moeda que o mock de catalog_products devolve (D11). Default: "BRL". */
  moedaDoCatalogo?: string;
  /** Moeda da proposta já gravada (D11). Default: "BRL". */
  moedaDaProposta?: string;
  /** Itens devolvidos pelo SELECT de itens (GET e base da PATCH). Default: os 4 fixos. */
  itensFixos?: Linha[];
  /** Preço ATUAL por product_id para o `.in` do GET (N4). id ausente = produto apagado. */
  precosAtuaisDoCatalogo?: Record<string, number>;
}

function montarMundoDeEdicao(opts: MundoOpts = {}) {
  const proposta: Linha = {
    id: PROPOSAL_ID,
    organization_id: opts.outraOrg ? OTHER_ORG_ID : ORG_ID,
    revision: opts.revisionAtual ?? 1,
    status: opts.status ?? "rascunho",
    titulo: "Site institucional",
    condicoes: "Entrada de 50%",
    valid_until: "2026-10-01",
    total_cents: 300,
    moeda: opts.moedaDaProposta ?? "BRL",
  };
  let propostaAtualizada: Linha | null = null;
  let itens: Linha[] = opts.itensFixos ?? [
    { ...item, id: ITEM_ID, organization_id: ORG_ID, proposal_id: PROPOSAL_ID, descricao: "Segundo", position: 2000, preco_unitario_cents: 200 },
    { ...item, organization_id: ORG_ID, proposal_id: PROPOSAL_ID, descricao: "Primeiro", position: 1000, preco_unitario_cents: 100 },
    { ...item, organization_id: ORG_ID, proposal_id: OTHER_PROPOSAL_ID, descricao: "Outra proposta" },
    { ...item, organization_id: OTHER_ORG_ID, proposal_id: OTHER_PROPOSAL_ID, descricao: "Outra organização" },
  ];
  const consultas: Consulta[] = [];
  const inseridos: Linha[] = [];
  mocks.createClient.mockResolvedValue({
    from(tabela: string) {
      // Preço do catálogo (C3): select→eq→eq→eq→maybeSingle. Não entra na
      // lista de `consultas` — é leitura auxiliar, não escrita da edição.
      if (tabela === "catalog_products") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cadeiaCatalogo: any = {
          eq: () => cadeiaCatalogo,
          // N4 — o GET busca os preços ATUAIS em lote: select→eq→in.
          in: async (_campo: string, ids: string[]) => ({
            data: ids.flatMap((pid) => {
              const preco = opts.precosAtuaisDoCatalogo?.[pid];
              return preco === undefined ? [] : [{ id: pid, preco_cents: preco }];
            }),
            error: null,
          }),
          maybeSingle: async () => (
            opts.precoDoCatalogo === undefined || opts.precoDoCatalogo === null
              ? { data: null, error: null }
              : { data: { preco_cents: opts.precoDoCatalogo, moeda: opts.moedaDoCatalogo ?? "BRL" }, error: null }
          ),
        };
        return { select: () => cadeiaCatalogo };
      }
      const consulta: Consulta = { tabela, operacao: "select", filtros: new Map() };
      consultas.push(consulta);
      let atualizacao: Linha = {};
      let linhas: Linha[] = [];
      let ordenarPor: string | undefined;
      const corresponde = (linha: Linha) => [...consulta.filtros].every(([campo, valor]) => linha[campo] === valor);
      const executar = async () => {
        const prefixo = tabela === "crm_proposals" ? "proposta" : "itens";
        if (opts.falha === `${prefixo}.${consulta.operacao}`) {
          return { data: null, error: { message: "Falha simulada" } };
        }
        if (tabela === "crm_proposals") {
          if (opts.ausente || !corresponde(proposta)) return { data: null, error: null };
          if (consulta.operacao === "update") {
            Object.assign(proposta, Object.fromEntries(Object.entries(atualizacao).filter(([, valor]) => valor !== undefined)));
            propostaAtualizada = { ...proposta };
          }
          return { data: { ...proposta }, error: null };
        }
        if (tabela !== "crm_proposal_items") throw new Error(`Tabela inesperada: ${tabela}`);
        if (consulta.operacao === "delete") itens = itens.filter((linha) => !corresponde(linha));
        if (consulta.operacao === "insert") {
          if (linhas.some((linha) => linha.organization_id !== proposta.organization_id)) {
            return { data: null, error: { message: "Organização obrigatória e consistente" } };
          }
          inseridos.push(...linhas);
          itens.push(...linhas);
        }
        const encontrados = itens.filter(corresponde);
        if (ordenarPor) {
          const campo = ordenarPor;
          encontrados.sort((a, b) => Number(a[campo]) - Number(b[campo]));
        }
        return { data: encontrados, error: null };
      };
      const query = {
        select: () => query,
        update: (valores: Linha) => { consulta.operacao = "update"; atualizacao = valores; return query; },
        delete: () => { consulta.operacao = "delete"; return query; },
        insert: (valores: Linha[]) => { consulta.operacao = "insert"; linhas = valores; return query; },
        eq: (campo: string, valor: unknown) => { consulta.filtros.set(campo, valor); return query; },
        order: (campo: string) => { ordenarPor = campo; return query; },
        maybeSingle: executar,
        then: <T>(resolve: (resultado: Awaited<ReturnType<typeof executar>>) => T) => executar().then(resolve),
      };
      return query;
    },
  });
  return {
    consultas,
    inseridos,
    get propostaAtualizada() { return propostaAtualizada; },
    get itens() { return itens; },
    async PATCH(corpo: unknown, id = PROPOSAL_ID, jsonCru?: string) {
      const { PATCH } = await import("./route");
      return PATCH(new NextRequest(`http://localhost/api/v1/proposals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: jsonCru ?? JSON.stringify(corpo),
      }), { params: Promise.resolve({ id }) });
    },
    async GET(id = PROPOSAL_ID) {
      const { GET } = await import("./route");
      return GET(new NextRequest(`http://localhost/api/v1/proposals/${id}`), { params: Promise.resolve({ id }) });
    },
    async DELETE(id = PROPOSAL_ID) {
      const { DELETE } = await import("./route");
      return DELETE(new NextRequest(`http://localhost/api/v1/proposals/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: USER_ID, idioma: "pt-BR" }, org: { orgId: ORG_ID } });
  mocks.requireSupportWrite.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/proposals/[id]", () => {
  it("com revision correta substitui itens e campos, recalcula total e incrementa revision", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.PATCH({ revision: 1, titulo: "Site institucional v2", condicoes: null, valid_until: null, itens: [item] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: PROPOSAL_ID, revision: 2, total_cents: 700000 } });
    expect(mundo.propostaAtualizada).toMatchObject({ titulo: "Site institucional v2", condicoes: null, valid_until: null, revision: 2, total_cents: 700000 });
    expect(mundo.itens.filter((linha) => linha.proposal_id === PROPOSAL_ID)).toEqual([{ ...item, proposal_id: PROPOSAL_ID, organization_id: ORG_ID }]);
    expect(mocks.requireRole).toHaveBeenCalledWith("agent", expect.objectContaining({ resource: "crm_proposals" }));
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: "proposal.edited", organizationId: ORG_ID, actorUserId: USER_ID, resourceId: PROPOSAL_ID, requestId: res.headers.get("X-Request-Id") }));
  });

  it("edita itens com product_id: preço é RECALCULADO do catálogo na hora, não reaproveita o preço antigo (Review Focus 4)", async () => {
    // mock catalog_products.preco_cents = 4000 no momento da PATCH (diferente
    // do que a proposta tinha gravado antes).
    const mundo = montarMundoDeEdicao({ precoDoCatalogo: 4000 });
    const res = await mundo.PATCH({
      revision: 1,
      itens: [{ product_id: PRODUCT_ID, descricao: "x", quantidade: 1, preco_unitario_cents: 111, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(200);
    expect(mundo.inseridos).toEqual(
      expect.arrayContaining([expect.objectContaining({ preco_unitario_cents: 4000 })]),
    );
  });

  it("edita para um product_id que não existe na organização: 422, itens antigos NÃO são apagados", async () => {
    const mundo = montarMundoDeEdicao({ precoDoCatalogo: null });
    const antes = [...mundo.itens];
    const res = await mundo.PATCH({
      revision: 1,
      itens: [{ product_id: PRODUCT_INEXISTENTE, descricao: "x", quantidade: 1, preco_unitario_cents: 100, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(422);
    expect(mundo.itens).toEqual(antes);
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mundo.consultas.some((q) => q.tabela === "crm_proposal_items" && q.operacao === "delete")).toBe(false);
  });

  it("item de catálogo em moeda diferente da proposta já gravada: 422, itens antigos NÃO são apagados (D11)", async () => {
    const mundo = montarMundoDeEdicao({ precoDoCatalogo: 4000, moedaDoCatalogo: "USD", moedaDaProposta: "BRL" });
    const antes = [...mundo.itens];
    const res = await mundo.PATCH({
      revision: 1,
      itens: [{ product_id: PRODUCT_ID, descricao: "x", quantidade: 1, preco_unitario_cents: 100, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(422);
    expect(mundo.itens).toEqual(antes);
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mundo.consultas.some((q) => q.tabela === "crm_proposal_items" && q.operacao === "delete")).toBe(false);
  });

  it("edita item para sem preço (null): pricing_status vira missing e é PERSISTIDO", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.PATCH({
      revision: 1,
      itens: [{ product_id: null, descricao: "x", quantidade: 1, preco_unitario_cents: null, desconto_cents: 0, position: 1000 }],
    });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ pricing_status: "missing" });
  });

  it("ao editar itens com sucesso, tenta resolver o aviso de revisão", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.PATCH({ revision: 1, itens: [item] });
    expect(res.status).toBe(200);
    expect(mocks.resolverAvisoDeRevisaoSeProntaOuEncerrada).toHaveBeenCalledWith(expect.anything(), ORG_ID, PROPOSAL_ID);
  });

  it("revision desatualizada retorna 409 e não altera proposta nem itens", async () => {
    const mundo = montarMundoDeEdicao({ revisionAtual: 3 });
    const antes = [...mundo.itens];
    const res = await mundo.PATCH({ revision: 1, itens: [] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "proposal_context_stale" } });
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mundo.itens).toEqual(antes);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["enviada", "aceita", "recusada", "vencida", "cancelada", "substituida"])("status=%s recusa PATCH sem tocar nos itens", async (status) => {
    const mundo = montarMundoDeEdicao({ status });
    const antes = [...mundo.itens];
    expect((await mundo.PATCH({ revision: 1, itens: [] })).status).toBe(409);
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mundo.itens).toEqual(antes);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserva itens de outras propostas/organizações e ignora vínculos enviados no body", async () => {
    const mundo = montarMundoDeEdicao();
    const outros = mundo.itens.filter((linha) => linha.proposal_id !== PROPOSAL_ID);
    expect((await mundo.PATCH({ revision: 1, organization_id: OTHER_ORG_ID, itens: [{ ...item, id: ITEM_ID, organization_id: OTHER_ORG_ID, proposal_id: OTHER_PROPOSAL_ID }] })).status).toBe(200);
    expect(mundo.itens.filter((linha) => linha.proposal_id !== PROPOSAL_ID)).toEqual(outros);
    expect(mundo.inseridos).toEqual([{ ...item, organization_id: ORG_ID, proposal_id: PROPOSAL_ID }]);
    for (const consulta of mundo.consultas.filter((q) => q.operacao !== "insert")) {
      expect(consulta.filtros.get("organization_id")).toBe(ORG_ID);
      expect(consulta.filtros.get(consulta.tabela === "crm_proposals" ? "id" : "proposal_id")).toBe(PROPOSAL_ID);
    }
  });

  it("não altera proposta de outra organização", async () => {
    const mundo = montarMundoDeEdicao({ outraOrg: true });
    expect((await mundo.PATCH({ revision: 1, itens: [] })).status).toBe(409);
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mundo.consultas).toHaveLength(1);
  });

  it("permite esvaziar itens sem apagar campos omitidos", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH({ revision: 1, itens: [] })).status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ total_cents: 0, revision: 2, titulo: "Site institucional", condicoes: "Entrada de 50%", valid_until: "2026-10-01" });
    expect(mundo.itens.filter((linha) => linha.proposal_id === PROPOSAL_ID)).toEqual([]);
    expect(mundo.consultas.some((q) => q.operacao === "insert")).toBe(false);
  });

  it.each([{ itens: [] }, { revision: 0, itens: [] }, { revision: 1 }, { revision: 1, itens: [{ ...item, quantidade: 0 }] }, { revision: 1, valid_until: "inválido", itens: [] }])("valida body antes de gravar: %j", async (corpo) => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH(corpo)).status).toBe(422);
    expect(mundo.consultas).toHaveLength(0);
  });

  it("recusa JSON malformado", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH(null, PROPOSAL_ID, "{")).status).toBe(422);
    expect(mundo.consultas).toHaveLength(0);
  });

  it("valida UUID do path", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH({ revision: 1, itens: [] }, "inválido")).status).toBe(422);
    expect(mundo.consultas).toHaveLength(0);
  });

  it("respeita recusa de suporte antes de autorizar ou consultar", async () => {
    const mundo = montarMundoDeEdicao();
    mocks.requireSupportWrite.mockResolvedValue(fail("forbidden", "Somente leitura", 403));
    expect((await mundo.PATCH({ revision: 1, itens: [] })).status).toBe(403);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mundo.consultas).toHaveLength(0);
  });

  it("respeita recusa de papel sem consultar", async () => {
    const mundo = montarMundoDeEdicao();
    mocks.requireRole.mockResolvedValue({ ok: false, response: fail("forbidden_role", "Sem permissão", 403) });
    expect((await mundo.PATCH({ revision: 1, itens: [] })).status).toBe(403);
    expect(mundo.consultas).toHaveLength(0);
  });

  it.each(["proposta.update", "itens.delete", "itens.insert"] as const)("não retorna sucesso nem audita quando falha %s", async (falha) => {
    const mundo = montarMundoDeEdicao({ falha });
    expect((await mundo.PATCH({ revision: 1, itens: [item] })).status).toBe(500);
    expect(mocks.audit).not.toHaveBeenCalled();
    if (falha !== "itens.insert") expect(mundo.inseridos).toHaveLength(0);
    if (falha === "proposta.update") expect(mundo.propostaAtualizada).toBeNull();
  });

  it("grava prazo em dias úteis e pagamento (P1 — nada no produto escrevia essas colunas)", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.PATCH({ revision: 1, prazo_dias_uteis: 30, pagamento: "50% no aceite, 50% na entrega", itens: [item] });
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ prazo_dias_uteis: 30, pagamento: "50% no aceite, 50% na entrega" });
  });

  it("prazo fora de 1..365 é recusado (422)", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.PATCH({ revision: 1, prazo_dias_uteis: 0, itens: [item] })).status).toBe(422);
    expect((await mundo.PATCH({ revision: 1, prazo_dias_uteis: 400, itens: [item] })).status).toBe(422);
    expect(mundo.propostaAtualizada).toBeNull();
  });

  it("omitir prazo e pagamento não os apaga", async () => {
    const mundo = montarMundoDeEdicao();
    await mundo.PATCH({ revision: 1, itens: [item] });
    expect(mundo.propostaAtualizada).not.toHaveProperty("pagamento");
  });
});

// D4, item 3 da spec ("descartar a v2 em rascunho não toca na v1") — achado
// Importante da revisão C4: não existia NENHUM jeito de descartar um
// rascunho (v2 de revisão ou v1 comum), então "Revisar" por engano travava
// o negócio para sempre (§5.3 só permite um rascunho aberto por vez).
describe("DELETE /api/v1/proposals/[id]", () => {
  it("descarta um rascunho: vira cancelada, nunca é apagado de verdade", async () => {
    const mundo = montarMundoDeEdicao({ status: "rascunho" });
    const res = await mundo.DELETE();
    expect(res.status).toBe(200);
    expect(mundo.propostaAtualizada).toMatchObject({ status: "cancelada" });
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: "proposal.discarded", organizationId: ORG_ID, resourceId: PROPOSAL_ID }));
  });

  it("proposta não está em rascunho (ex.: enviada): 409, não descarta", async () => {
    const mundo = montarMundoDeEdicao({ status: "enviada" });
    const res = await mundo.DELETE();
    expect(res.status).toBe(409);
    expect(mundo.propostaAtualizada).toBeNull();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("papel agent (abaixo de manager): 403, não descarta", async () => {
    mocks.requireRole.mockResolvedValue({ ok: false, response: fail("forbidden_role", "Sem permissão", 403) });
    const mundo = montarMundoDeEdicao({ status: "rascunho" });
    const res = await mundo.DELETE();
    expect(res.status).toBe(403);
    expect(mundo.propostaAtualizada).toBeNull();
  });

  it("proposta de outra organização: 404 (via 409 do filtro, nunca vaza a existência)", async () => {
    const mundo = montarMundoDeEdicao({ status: "rascunho", outraOrg: true });
    const res = await mundo.DELETE();
    expect(res.status).toBe(409);
    expect(mundo.propostaAtualizada).toBeNull();
  });

  it("ao descartar com sucesso, resolve o aviso de revisão com forcar: true", async () => {
    const mundo = montarMundoDeEdicao({ status: "rascunho" });
    const res = await mundo.DELETE();
    expect(res.status).toBe(200);
    expect(mocks.resolverAvisoDeRevisaoSeProntaOuEncerrada).toHaveBeenCalledWith(expect.anything(), ORG_ID, PROPOSAL_ID, { forcar: true });
  });
});

describe("GET /api/v1/proposals/[id]", () => {
  it("retorna detalhe e itens ordenados, filtrados pela proposta e organização", async () => {
    const mundo = montarMundoDeEdicao();
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: PROPOSAL_ID, revision: 1, itens: [{ descricao: "Primeiro" }, { descricao: "Segundo" }] } });
    expect(mocks.requireRole).toHaveBeenCalledWith("viewer", expect.objectContaining({ resource: "crm_proposals" }));
    expect(mocks.requireSupportWrite).not.toHaveBeenCalled();
    for (const consulta of mundo.consultas) expect(consulta.filtros.get("organization_id")).toBe(ORG_ID);
  });

  it.each([{ ausente: true }, { outraOrg: true }])("retorna 404 sem consultar itens quando proposta inacessível: %j", async (opts) => {
    const mundo = montarMundoDeEdicao(opts);
    expect((await mundo.GET()).status).toBe(404);
    expect(mundo.consultas).toHaveLength(1);
  });

  it.each(["proposta.select", "itens.select"] as const)("retorna 500 em %s em vez de disfarçar falha como ausência", async (falha) => {
    const mundo = montarMundoDeEdicao({ falha });
    expect((await mundo.GET()).status).toBe(500);
  });

  it("valida UUID do path sem consultar", async () => {
    const mundo = montarMundoDeEdicao();
    expect((await mundo.GET("inválido")).status).toBe(422);
    expect(mundo.consultas).toHaveLength(0);
  });

  it("respeita recusa de autenticação", async () => {
    const mundo = montarMundoDeEdicao();
    mocks.requireRole.mockResolvedValue({ ok: false, response: fail("unauthenticated", "Sem sessão", 401) });
    expect((await mundo.GET()).status).toBe(401);
    expect(mundo.consultas).toHaveLength(0);
  });

  it("item de catálogo cujo preço MUDOU desde que foi adicionado: devolve preco_catalogo_atual_cents diferente do gravado (N4)", async () => {
    const mundo = montarMundoDeEdicao({
      itensFixos: [
        { ...item, id: "i1", organization_id: ORG_ID, proposal_id: PROPOSAL_ID, product_id: PRODUCT_ID, descricao: "Catálogo", position: 1000, preco_unitario_cents: 5000 },
        { ...item, id: "i2", organization_id: ORG_ID, proposal_id: PROPOSAL_ID, product_id: null, descricao: "Manual", position: 2000, preco_unitario_cents: 700 },
      ],
      precosAtuaisDoCatalogo: { [PRODUCT_ID]: 6000 },
    });
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const deCatalogo = body.data.itens.find((i: { product_id: string | null }) => i.product_id !== null);
    expect(deCatalogo.preco_unitario_cents).toBe(5000);
    expect(deCatalogo.preco_catalogo_atual_cents).toBe(6000);
  });

  it("item de catálogo cujo preço NÃO mudou: preco_catalogo_atual_cents igual ao gravado", async () => {
    const mundo = montarMundoDeEdicao({
      itensFixos: [
        { ...item, id: "i1", organization_id: ORG_ID, proposal_id: PROPOSAL_ID, product_id: PRODUCT_ID, descricao: "Catálogo", position: 1000, preco_unitario_cents: 5000 },
      ],
      precosAtuaisDoCatalogo: { [PRODUCT_ID]: 5000 },
    });
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const deCatalogo = body.data.itens.find((i: { product_id: string | null }) => i.product_id !== null);
    expect(deCatalogo.preco_catalogo_atual_cents).toBe(deCatalogo.preco_unitario_cents);
  });

  it("item MANUAL (sem product_id): preco_catalogo_atual_cents é null, nunca compara com nada (Review Focus 4)", async () => {
    const mundo = montarMundoDeEdicao({
      itensFixos: [
        { ...item, id: "i2", organization_id: ORG_ID, proposal_id: PROPOSAL_ID, product_id: null, descricao: "Manual", position: 1000, preco_unitario_cents: 700 },
      ],
      precosAtuaisDoCatalogo: {},
    });
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const manual = body.data.itens.find((i: { product_id: string | null }) => i.product_id === null);
    expect(manual.preco_catalogo_atual_cents).toBeNull();
  });

  it("produto do catálogo foi APAGADO desde então: preco_catalogo_atual_cents é null, não quebra", async () => {
    const mundo = montarMundoDeEdicao({
      itensFixos: [
        { ...item, id: "i1", organization_id: ORG_ID, proposal_id: PROPOSAL_ID, product_id: PRODUCT_ID, descricao: "Catálogo", position: 1000, preco_unitario_cents: 5000 },
      ],
      precosAtuaisDoCatalogo: {},
    });
    const res = await mundo.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.itens[0].preco_catalogo_atual_cents).toBeNull();
  });
});
