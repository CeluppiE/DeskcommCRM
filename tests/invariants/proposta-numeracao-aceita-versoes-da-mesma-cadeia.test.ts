import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { GOV_CONTACT_1, GOV_ORG, GOV_PIPELINE, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * C4/D4/0413 — a unicidade de numeração passa a ser
 * (organization_id, ano, numero, versao), não mais (organization_id, ano,
 * numero): a v1 `enviada` e a v2 `rascunho` da mesma cadeia convivem com o
 * MESMO número enquanto a v2 não é enviada (índice
 * `crm_proposals_numero_ano_versao_org_uidx`, parcial — exclui
 * `status = 'substituida'`).
 *
 * Achado Importante da revisão C4: nenhum invariante provava esta troca
 * contra Postgres real (só `pnpm test:db`, não roda no `test:unit`).
 */

const LEAD_A = "cccccccc-7777-4000-8000-000000000021";
const LEAD_B = "cccccccc-7777-4000-8000-000000000022";
const PROP_V1 = "cccccccc-7777-4000-8000-000000000031";
const PROP_V2 = "cccccccc-7777-4000-8000-000000000032";
const PROP_COLIDE = "cccccccc-7777-4000-8000-000000000033";
const PROP_NOVA_V1 = "cccccccc-7777-4000-8000-000000000034";

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
      `('${PROP_V1}', '${PROP_V2}', '${PROP_COLIDE}', '${PROP_NOVA_V1}');`,
  );
}

beforeAll(() => {
  seedGov();
  limparPropostas();
  criarLead(LEAD_A, "numeracao por versao A");
  criarLead(LEAD_B, "numeracao por versao B");
});

describe("numeração aceita versões da mesma cadeia (índice organization_id, ano, numero, versao)", () => {
  it("v1 enviada e v2 rascunho da MESMA cadeia convivem com o mesmo numero/ano (D4 — controle positivo)", async () => {
    sql(`
      insert into public.crm_proposals
          (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, versao)
        values ('${PROP_V1}', '${GOV_ORG}', '${LEAD_A}', '${GOV_CONTACT_1}', 'v1 enviada', 'enviada', 42, 2026, 1);
      insert into public.crm_proposals
          (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, versao, substitui_id)
        values ('${PROP_V2}', '${GOV_ORG}', '${LEAD_A}', '${GOV_CONTACT_1}', 'v2 rascunho', 'rascunho', 42, 2026, 2, '${PROP_V1}');
    `);
    const total = sql(
      `select count(*) from public.crm_proposals where id in ('${PROP_V1}', '${PROP_V2}') and numero = 42 and ano = 2026;`,
    );
    expect(total).toBe("2");
  });

  it("duas linhas com a MESMA versão, mesmo numero/ano, nenhuma substituida: 23505 (a v2 não pode duplicar dentro da própria cadeia)", async () => {
    // Achado do CI (test:db, pg15/pg17): status 'rascunho' aqui batia PRIMEIRO
    // na trava "um rascunho por negócio" (crm_proposals_rascunho_unico_por_
    // negocio_uidx, migration 0402) — LEAD_A já tem a PROP_V2 em rascunho do
    // teste anterior. 'enviada' isola o que este teste quer medir: só a
    // unicidade de (organization_id, ano, numero, versao).
    await expect(
      pool.query(`
        insert into public.crm_proposals
            (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, versao)
          values ('${PROP_COLIDE}', '${GOV_ORG}', '${LEAD_A}', '${GOV_CONTACT_1}', 'v2 duplicada', 'enviada', 42, 2026, 2);
      `),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "crm_proposals_numero_ano_versao_org_uidx",
    });
  });

  it("v1 vira substituida: o número fica livre de novo para uma cadeia NOVA (índice é parcial)", async () => {
    sql(`update public.crm_proposals set status = 'substituida' where id = '${PROP_V1}';`);
    sql(`delete from public.crm_proposals where id = '${PROP_V2}';`);

    sql(`
      insert into public.crm_proposals
          (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, versao)
        values ('${PROP_NOVA_V1}', '${GOV_ORG}', '${LEAD_B}', '${GOV_CONTACT_1}', 'nova cadeia, mesmo numero', 'enviada', 42, 2026, 1);
    `);
    const status = sql(`select status from public.crm_proposals where id = '${PROP_NOVA_V1}';`);
    expect(status).toBe("enviada");
  });
});
