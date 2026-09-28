import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { GOV_CONTACT_1, GOV_ORG, GOV_PIPELINE, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * C3/§5.3 — um rascunho aberto por negócio (índice único parcial
 * `crm_proposals_rascunho_unico_por_negocio_uidx`).
 *
 * A trava de verdade é o índice (a pré-checagem por SELECT nas rotas perde a
 * corrida entre dois rascunhos simultâneos); estes testes provam o índice
 * contra Postgres real, via `pnpm test:db` (não rodam no `test:unit`).
 */

const LEAD_A = "cccccccc-7777-4000-8000-000000000001";
const LEAD_B = "cccccccc-7777-4000-8000-000000000002";
const LEAD_C = "cccccccc-7777-4000-8000-000000000003";
const LEAD_D = "cccccccc-7777-4000-8000-000000000004";
const PROP_A1 = "cccccccc-7777-4000-8000-000000000011";
const PROP_A2 = "cccccccc-7777-4000-8000-000000000012";
const PROP_B1 = "cccccccc-7777-4000-8000-000000000013";
const PROP_B2 = "cccccccc-7777-4000-8000-000000000014";
const PROP_D1 = "cccccccc-7777-4000-8000-000000000015";
const PROP_D2 = "cccccccc-7777-4000-8000-000000000016";

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

function limparPropostas(): void {
  sql(
    `delete from public.crm_proposals where id in ` +
      `('${PROP_A1}', '${PROP_A2}', '${PROP_B1}', '${PROP_B2}', '${PROP_D1}', '${PROP_D2}');`,
  );
}

beforeAll(() => {
  seedGov();
  limparPropostas();
  criarLead(LEAD_A, "rascunho unico A");
  criarLead(LEAD_B, "rascunho unico B");
  criarLead(LEAD_C, "rascunho unico C");
  criarLead(LEAD_D, "rascunho unico D");
});

describe("um rascunho aberto por negócio (índice único parcial)", () => {
  it("segundo rascunho para o MESMO negócio é recusado pelo banco (23505)", async () => {
    sql(`
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${PROP_A1}', '${GOV_ORG}', '${LEAD_A}', '${GOV_CONTACT_1}', 'Primeiro rascunho', 'rascunho');
    `);

    await expect(
      pool.query(`
        insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
          values ('${PROP_A2}', '${GOV_ORG}', '${LEAD_A}', '${GOV_CONTACT_1}', 'Segundo rascunho', 'rascunho');
      `),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "crm_proposals_rascunho_unico_por_negocio_uidx",
    });

    sql(`delete from public.crm_proposals where id = '${PROP_A1}';`);
  });

  it("negócios DIFERENTES podem ter rascunho aberto ao mesmo tempo (controle positivo)", async () => {
    sql(`
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${PROP_B1}', '${GOV_ORG}', '${LEAD_B}', '${GOV_CONTACT_1}', 'Rascunho B', 'rascunho');
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${PROP_B2}', '${GOV_ORG}', '${LEAD_C}', '${GOV_CONTACT_1}', 'Rascunho C', 'rascunho');
    `);
    const total = sql(
      `select count(*) from public.crm_proposals where id in ('${PROP_B1}', '${PROP_B2}') and status = 'rascunho';`,
    );
    expect(total).toBe("2");

    sql(`delete from public.crm_proposals where id in ('${PROP_B1}', '${PROP_B2}');`);
  });

  it("segundo rascunho é ACEITO se o primeiro não estiver mais em rascunho (índice é parcial)", async () => {
    sql(`
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${PROP_D1}', '${GOV_ORG}', '${LEAD_D}', '${GOV_CONTACT_1}', 'Primeiro', 'rascunho');
      update public.crm_proposals set status = 'cancelada' where id = '${PROP_D1}';
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${PROP_D2}', '${GOV_ORG}', '${LEAD_D}', '${GOV_CONTACT_1}', 'Segundo, o primeiro ja foi cancelado', 'rascunho');
    `);
    const status = sql(`select status from public.crm_proposals where id = '${PROP_D2}';`);
    expect(status).toBe("rascunho");

    sql(`delete from public.crm_proposals where id in ('${PROP_D1}', '${PROP_D2}');`);
  });
});
