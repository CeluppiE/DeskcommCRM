// lib/propostas/aviso-de-revisao.test.ts
import { describe, expect, it } from "vitest";

import {
  EVENTO_PROPOSTA_PRONTA_PARA_REVISAO,
  avisarQuePropostaPrecisaDeRevisao,
  resolverAvisoDeRevisaoSeProntaOuEncerrada,
  tituloDoAviso,
} from "./aviso-de-revisao";

interface Opts {
  avisoAbertoExistente?: boolean;
  proposta?: Record<string, unknown> | null;
  contato?: { name: string | null; display_name: string | null } | null;
}

function montarSupabaseMock(opts: Opts) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "agent_inbox_items") return { data: opts.avisoAbertoExistente ? { id: "aviso-1" } : null, error: null };
      if (table === "crm_proposals") return { data: opts.proposta ?? null, error: null };
      if (table === "contacts") return { data: opts.contato ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return { from, inserts, updates };
}

/** Proposta com o site institucional REAL do código e tudo preenchido. */
const PRONTA = {
  template_slug: "site_institucional",
  pricing_status: "catalog",
  secoes_editadas: null,
  briefing_json: {
    client: { name: "Maria", company: "Imobiliária Exemplo" },
    project: { name: "Site", objective: "gerar contatos" },
    scope: { pages_list: "Home, Contato" },
    included: { list: "Layout" },
    excluded: { list: "Hospedagem" },
  },
  total_cents: 100000,
  moeda: "BRL",
  prazo_dias_uteis: 30,
  valid_until: "2026-10-16",
  created_at: "2026-09-26T00:00:00.000Z",
  contact_id: null,
};

describe("tituloDoAviso", () => {
  it("nomeia a proposta e o cliente", () => {
    expect(tituloDoAviso("Site catálogo", "Maria")).toBe("Proposta «Site catálogo» de Maria está pronta para revisão");
  });
  it("sem cliente, só a proposta", () => {
    expect(tituloDoAviso("Site catálogo", null)).toBe("Proposta «Site catálogo» está pronta para revisão");
  });
  it("corta título enorme em 80 caracteres", () => {
    expect(tituloDoAviso("x".repeat(300), null)).toBe(`Proposta «${"x".repeat(80)}» está pronta para revisão`);
  });
});

describe("avisarQuePropostaPrecisaDeRevisao", () => {
  it("abre o aviso com warn e título nomeado, e emite o evento", async () => {
    const db = montarSupabaseMock({
      proposta: { titulo: "Site catálogo", lead_id: "lead-1", contact_id: "c-1" },
      contato: { name: "Maria", display_name: null },
    });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    const aviso = db.inserts.find((i) => i.table === "agent_inbox_items")?.row;
    expect(aviso).toMatchObject({
      organization_id: "org-1",
      kind: "proposta_pronta_para_revisao",
      severity: "warn",
      title: "Proposta «Site catálogo» de Maria está pronta para revisão",
      ref_kind: "proposal",
      ref_id: "prop-1",
      status: "open",
    });
    const evento = db.inserts.find((i) => i.table === "event_log")?.row;
    expect(evento).toMatchObject({
      organization_id: "org-1",
      event_type: EVENTO_PROPOSTA_PRONTA_PARA_REVISAO,
      entity_kind: "proposal",
      entity_id: "prop-1",
      payload: { proposal_id: "prop-1", lead_id: "lead-1" },
    });
  });

  it("aviso já aberto: não insere de novo NEM emite evento (preencher campo de novo não reabre notificação)", async () => {
    const db = montarSupabaseMock({ avisoAbertoExistente: true });
    await avisarQuePropostaPrecisaDeRevisao(db as never, "org-1", "prop-1");
    expect(db.inserts).toEqual([]);
  });
});

describe("resolverAvisoDeRevisaoSeProntaOuEncerrada", () => {
  it("resolve quando modelo, preço E documento estão prontos", async () => {
    const db = montarSupabaseMock({ proposta: PRONTA });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([
      { table: "agent_inbox_items", patch: { status: "resolved", resolved_at: expect.any(String) } },
    ]);
  });

  it("resolver grava resolved_at como ISO válido (C6)", async () => {
    const db = montarSupabaseMock({ proposta: PRONTA });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    const patch = db.updates[0]?.patch as { resolved_at: string };
    expect(typeof patch.resolved_at).toBe("string");
    expect(Number.isNaN(Date.parse(patch.resolved_at))).toBe(false);
  });

  it("NÃO resolve com campo do documento vazio, mesmo com modelo e preço ok", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, prazo_dias_uteis: null } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("NÃO resolve sem modelo confirmado", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, template_slug: null } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("NÃO resolve com preço 'missing'", async () => {
    const db = montarSupabaseMock({ proposta: { ...PRONTA, pricing_status: "missing" } });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1");
    expect(db.updates).toEqual([]);
  });

  it("forcar: resolve sem ler a proposta", async () => {
    const db = montarSupabaseMock({ proposta: null });
    await resolverAvisoDeRevisaoSeProntaOuEncerrada(db as never, "org-1", "prop-1", { forcar: true });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toEqual({
      table: "agent_inbox_items",
      patch: { status: "resolved", resolved_at: expect.any(String) },
    });
  });
});
