import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { GOV_CONTACT_1, GOV_ORG, GOV_PIPELINE, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * C3/§5.1-§5.2 — `crm_proposal_items.preco_unitario_cents` aceita NULL ("a
 * definir") sem amolecer o CHECK de preço negativo, e `crm_proposals`
 * nasce com `pricing_status = 'missing'` num vocabulário fechado.
 *
 * Roda contra Postgres real via `pnpm test:db` (não roda no `test:unit`).
 */

const LEAD_P1 = "cccccccc-8888-4000-8000-000000000001";
const LEAD_P2 = "cccccccc-8888-4000-8000-000000000002";
const LEAD_P3 = "cccccccc-8888-4000-8000-000000000003";
const PROP_P1 = "cccccccc-8888-4000-8000-000000000011";
const PROP_P2 = "cccccccc-8888-4000-8000-000000000012";
const PROP_P3 = "cccccccc-8888-4000-8000-000000000013";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

afterAll(async () => {
  await pool.end();
});

function criarLead(id: string, titulo: string): void {
  sql(`
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
      values ('${id}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${titulo}')
      on conflict (id) do nothing;
  `);
}

function criarProposta(id: string, lead: string, titulo: string): void {
  sql(`
    insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
      values ('${id}', '${GOV_ORG}', '${lead}', '${GOV_CONTACT_1}', '${titulo}', 'rascunho');
  `);
}

function limparTudo(): void {
  sql(
    `delete from public.crm_proposals where id in ('${PROP_P1}', '${PROP_P2}', '${PROP_P3}');`,
  );
}

beforeAll(() => {
  seedGov();
  limparTudo();
  criarLead(LEAD_P1, "preco do catalogo P1");
  criarLead(LEAD_P2, "preco do catalogo P2");
  criarLead(LEAD_P3, "preco do catalogo P3");
});

describe("crm_proposal_items.preco_unitario_cents aceita NULL (item sem preço)", () => {
  it("insere item com preco_unitario_cents null (a definir)", () => {
    criarProposta(PROP_P1, LEAD_P1, "Proposta");
    sql(`
      insert into public.crm_proposal_items
        (organization_id, proposal_id, descricao, quantidade, preco_unitario_cents, position)
        values ('${GOV_ORG}', '${PROP_P1}', 'Item a definir', 1, null, 1000);
    `);
    const preco = sql(
      `select preco_unitario_cents is null from public.crm_proposal_items where proposal_id = '${PROP_P1}';`,
    );
    expect(preco).toBe("t");

    sql(`delete from public.crm_proposals where id = '${PROP_P1}';`);
  });

  it("continua recusando preço NEGATIVO (o CHECK não amoleceu, só o NOT NULL)", async () => {
    criarProposta(PROP_P2, LEAD_P2, "Proposta");
    await expect(
      pool.query(`
        insert into public.crm_proposal_items
          (organization_id, proposal_id, descricao, quantidade, preco_unitario_cents, position)
          values ('${GOV_ORG}', '${PROP_P2}', 'Item negativo', 1, -100, 1000);
      `),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "crm_proposal_items_preco_nao_negativo",
    });

    sql(`delete from public.crm_proposals where id = '${PROP_P2}';`);
  });
});

describe("crm_proposals.pricing_status", () => {
  it("nasce 'missing' por padrão e recusa valor fora do vocabulário", async () => {
    criarProposta(PROP_P3, LEAD_P3, "Proposta");
    const status = sql(`select pricing_status from public.crm_proposals where id = '${PROP_P3}';`);
    expect(status).toBe("missing");

    await expect(
      pool.query(
        `update public.crm_proposals set pricing_status = 'inventado' where id = '${PROP_P3}';`,
      ),
    ).rejects.toMatchObject({ code: "23514" });

    sql(`delete from public.crm_proposals where id = '${PROP_P3}';`);
  });
});
