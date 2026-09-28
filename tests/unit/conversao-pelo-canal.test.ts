/**
 * Venda de anúncio reportada à Meta pela ponte do canal intermediado.
 *
 * Os modos de falha que este arquivo vigia:
 *   1. o 200 com `eventsFailed` lido como sucesso — a venda "enviada" que nunca chegou;
 *   2. centavos mandados como unidade — a compra de R$ 1.500 virando R$ 150.000;
 *   3. a mesma venda saindo pelos DOIS caminhos (canal e Meta direta);
 *   4. o canal passando por cima de quem já configurou a Meta direta — inclusive
 *      desligada, que é decisão de quem opera;
 *   5. uma instabilidade na leitura das conversas virando a pendência
 *      `sem_conexao` de uma venda que tem caminho.
 *
 * A feature (`lib/conversoes/`) nunca pergunta QUAL provider atende a conversa:
 * pergunta pela capacidade `reportConversion` do adapter. O provider concreto
 * aparece aqui só porque é ele quem implementa a capacidade hoje.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { conversaoDeVendaHandler } from "@/lib/conversoes/envio.handler";
import { vendaPeloCanalLigada } from "@/lib/conversoes/venda-pelo-canal";
import { zernioReportConversion } from "@/lib/channels/zernio/conversoes";
import { resolveZernioCreds } from "@/lib/channels/zernio/credentials";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/channels/zernio/credentials", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveZernioCreds: vi.fn(),
}));

const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";
const CREDS = { accountId: "ACC", apiKey: "k", baseUrl: "https://z.test/api", source: "session" as const };

const VENDA = {
  organizationId: ORG,
  sessionRef: "ACC",
  providerConversationId: "CONV1",
  phone: "5511988880000",
  event: "Purchase" as const,
  eventId: `${LEAD}:Purchase`,
  occurredAt: new Date("2026-09-23T12:00:00Z"),
  valueCents: 150_000,
  currency: "BRL",
};

const resposta = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(resolveZernioCreds).mockResolvedValue(CREDS);
});

describe("o envio pelo canal (o adapter)", () => {
  it("manda a venda em UNIDADES, com conversa, telefone e id de deduplicação", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      resposta({ eventsReceived: 1, eventsFailed: 0, traceId: "T1" }),
    );

    const r = await zernioReportConversion(VENDA);

    expect(r).toEqual({ outcome: "ok", detail: "via canal (trace T1)" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://z.test/api/v1/whatsapp/conversions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init?.body as string)).toEqual({
      accountId: "ACC",
      eventName: "Purchase",
      eventId: `${LEAD}:Purchase`,
      eventTime: Math.floor(VENDA.occurredAt.getTime() / 1000),
      value: 1_500,
      currency: "BRL",
      conversationId: "CONV1",
      phoneE164: "5511988880000",
    });
  });

  it("200 com eventsFailed é RECUSA, não sucesso", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      resposta({ eventsReceived: 0, eventsFailed: 1, failures: [{ message: "no ctwa_clid" }], traceId: "T2" }),
    );
    expect(await zernioReportConversion(VENDA)).toEqual({
      outcome: "rejected",
      detail: "no ctwa_clid (trace T2)",
    });
  });

  it("429 e 5xx esperam; o Retry-After manda", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(resposta({}, 429, { "retry-after": "30" }));
    expect(await zernioReportConversion(VENDA)).toMatchObject({ outcome: "retry", retryInMs: 30_000 });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(resposta({}, 503));
    expect(await zernioReportConversion(VENDA)).toMatchObject({ outcome: "retry" });
  });

  it("queda de rede espera; 4xx precisa de gente", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await zernioReportConversion(VENDA)).toMatchObject({ outcome: "retry" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      resposta({ code: "INVALID", error: "currency" }, 422),
    );
    expect(await zernioReportConversion(VENDA)).toEqual({
      outcome: "rejected",
      detail: "zernio_422 INVALID: currency",
    });
  });

  it("sem conversa conhecida, manda só o telefone", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ eventsReceived: 1, eventsFailed: 0 }));
    await zernioReportConversion({ ...VENDA, providerConversationId: null });
    const corpo = JSON.parse(f.mock.calls[0]![1]?.body as string);
    expect(corpo).not.toHaveProperty("conversationId");
    expect(corpo.phoneE164).toBe("5511988880000");
  });

  it("sem credencial não chama a rede", async () => {
    vi.mocked(resolveZernioCreds).mockResolvedValue(null);
    const f = vi.spyOn(globalThis, "fetch");
    expect(await zernioReportConversion(VENDA)).toEqual({ outcome: "rejected", detail: "zernio_not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
});

// ─── A escolha do caminho no handler ─────────────────────────────────────────

const gravados: Record<string, unknown>[] = [];

type ConexaoDireta = "ausente" | "ligada" | "desligada";

const tabelasLidas: string[] = [];

function fakeAdmin(t: {
  sessao: unknown;
  conexao?: ConexaoDireta;
  conversasIlegiveis?: boolean;
  /** A chave "Enviar vendas pelo canal da conversa" (doc 76). Padrão aqui: ligada. */
  vendaPeloCanal?: boolean;
}) {
  const conexao = t.conexao ?? "ausente";
  return {
    from(tabela: string) {
      tabelasLidas.push(tabela);
      const linhas: Record<string, unknown> = {
        crm_leads: {
          id: LEAD,
          status: "won",
          value_cents: 150_000,
          currency: "BRL",
          closed_at: new Date(Date.now() - 60_000).toISOString(),
          contact_id: CONTATO,
        },
        contacts: {
          phone_number: "+55 11 98888-0000",
          source_metadata: { ad_platform: "meta_ads", ad_source_id: "CTWA_X" },
        },
        channel_sessions: t.sessao,
        organizations: { settings: { conversions: { report_via_channel: t.vendaPeloCanal ?? true } } },
        ad_platform_connections:
          conexao === "ausente"
            ? null
            : {
                dataset_id: "1",
                access_token_encrypted: "\\xde",
                test_event_code: null,
                enabled: conexao === "ligada",
              },
      };
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: linhas[tabela] ?? null, error: null }),
        upsert: async (v: Record<string, unknown>) => {
          gravados.push(v);
          return { error: null };
        },
        // Leitura em lista (as conversas do contato).
        then: (ok: (r: unknown) => unknown) =>
          ok(
            tabela === "conversations" && t.conversasIlegiveis
              ? { data: null, error: { message: "timeout" } }
              : {
                  data:
                    tabela === "conversations"
                      ? [{ channel_session_id: "S1", provider_conversation_id: "CONV1" }]
                      : [],
                  error: null,
                },
          ),
      };
      return q;
    },
    rpc: async () => ({ data: "token", error: null }),
  };
}

const evento: EventRow = {
  id: "evt",
  organization_id: ORG,
  event_type: "lead.won",
  entity_kind: "crm_lead",
  entity_id: LEAD,
  payload: {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
  created_at: new Date().toISOString(),
};

const CANAL_COM_PONTE = { provider: "zernio", zernio_account_id: "ACC" };

describe("o handler escolhe UM caminho", () => {
  beforeEach(() => {
    gravados.length = 0;
    tabelasLidas.length = 0;
  });

  it("com a chave DESLIGADA (o padrão), nada sai para o provedor e nem as conversas são lidas", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: CANAL_COM_PONTE, vendaPeloCanal: false }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch");

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r).toMatchObject({ status: "skipped", detail: "sem_conexao" });
    expect(f).not.toHaveBeenCalled();
    expect(tabelasLidas).toContain("organizations");
    expect(tabelasLidas).not.toContain("conversations");
    expect(tabelasLidas).not.toContain("channel_sessions");
    expect(gravados.at(-1)).toMatchObject({ status: "skipped", reason: "sem_conexao" });
  });

  it("organização sem a chave gravada conta como desligada", async () => {
    expect(vendaPeloCanalLigada({})).toBe(false);
    expect(vendaPeloCanalLigada(null)).toBe(false);
    expect(vendaPeloCanalLigada({ conversions: { report_via_channel: "true" } })).toBe(false);
    expect(vendaPeloCanalLigada({ conversions: { report_via_channel: true } })).toBe(true);
  });

  it("chave LIGADA, sem conexão direta e conversa num canal com a capacidade: vai pelo canal", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: CANAL_COM_PONTE, vendaPeloCanal: true }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ eventsReceived: 1, eventsFailed: 0 }));

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r.status).toBe("ok");
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0]![0])).toContain("/v1/whatsapp/conversions");
    expect(JSON.parse(f.mock.calls[0]![1]?.body as string)).toMatchObject({
      eventName: "Purchase",
      eventId: `${LEAD}:Purchase`,
      value: 1_500,
      currency: "BRL",
      conversationId: "CONV1",
      phoneE164: "5511988880000",
    });
    expect(gravados.at(-1)).toMatchObject({ status: "sent", platform: "meta_ads", event_name: "Purchase" });
  });

  it("com a conexão direta ligada, a venda segue por ela — UMA vez, e o canal não é chamado", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: CANAL_COM_PONTE, conexao: "ligada" }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ events_received: 1 }));

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r.status).toBe("ok");
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0]![0])).toContain("graph.facebook.com");
    expect(String(f.mock.calls[0]![0])).not.toContain("/v1/whatsapp/conversions");
  });

  it("com a conexão direta DESLIGADA, o canal não passa por cima: a pendência de sempre", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: CANAL_COM_PONTE, conexao: "desligada" }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch");

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r).toMatchObject({ status: "skipped", detail: "conexao_desabilitada" });
    expect(f).not.toHaveBeenCalled();
  });

  it("canal sem a capacidade, ou sem sessão ativa: a pendência `sem_conexao` de sempre", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: { provider: "waha", waha_session_name: "default" } }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch");

    expect(await conversaoDeVendaHandler.handle(evento)).toMatchObject({
      status: "skipped",
      detail: "sem_conexao",
    });

    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ sessao: null }) as never);
    expect(await conversaoDeVendaHandler.handle(evento)).toMatchObject({
      status: "skipped",
      detail: "sem_conexao",
    });
    expect(f).not.toHaveBeenCalled();
    expect(gravados.at(-1)).toMatchObject({ status: "skipped", reason: "sem_conexao" });
  });

  it("leitura das conversas falhou: espera e tenta de novo, sem gravar pendência", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      fakeAdmin({ sessao: CANAL_COM_PONTE, conversasIlegiveis: true }) as never,
    );
    const f = vi.spyOn(globalThis, "fetch");

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r.status).toBe("retry");
    expect(r.detail).toContain("leitura do canal falhou");
    expect(f).not.toHaveBeenCalled();
    expect(gravados).toEqual([]);
  });

  it("o canal recusou: a tela mostra a recusa, com o motivo que o canal leu", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ sessao: CANAL_COM_PONTE }) as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      resposta({ eventsReceived: 0, eventsFailed: 1, failures: [{ message: "no dataset" }] }),
    );

    const r = await conversaoDeVendaHandler.handle(evento);

    expect(r).toMatchObject({ status: "skipped", detail: "recusado_pela_plataforma" });
    expect(gravados.at(-1)).toMatchObject({
      status: "error",
      reason: "recusado_pela_plataforma",
      detail: "no dataset",
    });
  });
});
