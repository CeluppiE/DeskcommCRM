import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { GOV_LEAD, GOV_CONTACT_1, GOV_ORG, GOV_VIEWER, GOV_AGENT_A, GOV_MANAGER, countAs, writeCountAs, seedGov, sql } from "./gov-helpers";

/**
 * M0 — proposal_templates guarda cópia por organização. Sem RLS provada
 * contra Postgres real, "organization_id filtra" é afirmação, não fato.
 *
 * Roda contra Postgres real via `pnpm test:db` (não roda no `test:unit`).
 */

const ORG_B = "dddddddd-8888-4000-8000-000000000001";
const USER_B = "dddddddd-8888-4000-8000-000000000002";
const TPL_A = "eeeeeeee-8888-4000-8000-000000000011";
const TPL_B = "eeeeeeee-8888-4000-8000-000000000012";
const PROP_CHECK = "eeeeeeee-8888-4000-8000-000000000021";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

afterAll(async () => {
  await pool.end();
});

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email)
      values ('${USER_B}', 'gov-m0-org-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'gov-inv-m0-b', 'Gov M0 Org B', 'Gov M0 B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'admin', now())
      on conflict do nothing;
  `);
  sql(`delete from public.proposal_templates where id in ('${TPL_A}', '${TPL_B}');`);
  sql(`
    insert into public.proposal_templates (id, organization_id, slug, version)
      values ('${TPL_A}', '${GOV_ORG}', 'institucional', 1);
    insert into public.proposal_templates (id, organization_id, slug, version)
      values ('${TPL_B}', '${ORG_B}', 'institucional', 1);
  `);
});

describe("proposal_templates — isolamento entre organizações (RLS)", () => {
  it("as duas organizações podem ter o MESMO slug sem colidir (unique é composto)", () => {
    const total = sql(`select count(*) from public.proposal_templates where slug = 'institucional' and id in ('${TPL_A}', '${TPL_B}');`);
    expect(total).toBe("2");
  });

  it("membro da organização A vê a cópia da A e não a da B (controle positivo + isolamento)", () => {
    // GOV_VIEWER é membro da GOV_ORG via seedGov(); USER_B só da ORG_B.
    // fn_user_org_ids() lê auth.uid(), não claim org_ids — por isso countAs.
    expect(countAs(GOV_VIEWER, `select count(*) from public.proposal_templates where id = '${TPL_A}';`)).toBe(1);
    expect(countAs(GOV_VIEWER, `select count(*) from public.proposal_templates where id = '${TPL_B}';`)).toBe(0);
    expect(countAs(USER_B, `select count(*) from public.proposal_templates where id = '${TPL_B}';`)).toBe(1);
    expect(countAs(USER_B, `select count(*) from public.proposal_templates where id = '${TPL_A}';`)).toBe(0);
  });

  it("viewer da organização NÃO consegue escrever modelo (achado Important da revisão final da M0 — piso de papel na RLS)", () => {
    const linhas = writeCountAs(
      GOV_VIEWER,
      `insert into public.proposal_templates (organization_id, slug) values ('${GOV_ORG}', 'viewer-nao-pode')`,
    );
    expect(linhas).toBe(0);
    sql(`delete from public.proposal_templates where slug = 'viewer-nao-pode';`);
  });

  it("agent NÃO escreve modelo (P5, D9 — o texto vai para todo cliente)", () => {
    const linhas = writeCountAs(
      GOV_AGENT_A,
      `insert into public.proposal_templates (organization_id, slug) values ('${GOV_ORG}', 'agent-nao-pode')`,
    );
    expect(linhas).toBe(0);
    sql(`delete from public.proposal_templates where slug = 'agent-nao-pode';`);
  });

  it("manager escreve modelo da própria organização (controle positivo do caso acima)", () => {
    const linhas = writeCountAs(
      GOV_MANAGER,
      `insert into public.proposal_templates (organization_id, slug, nome) values ('${GOV_ORG}', 'manager-pode', 'Modelo do gestor')`,
    );
    expect(linhas).toBe(1);
    sql(`delete from public.proposal_templates where slug = 'manager-pode';`);
  });

  it("duas versões ATIVAS do mesmo slug na MESMA organização: 23505", async () => {
    await expect(
      pool.query(`
        insert into public.proposal_templates (organization_id, slug, version, is_active)
          values ('${GOV_ORG}', 'institucional', 2, true);
      `),
    ).rejects.toMatchObject({ code: "23505", constraint: "proposal_templates_ativo_por_slug_org_uidx" });
  });

  it("template_slug sem template_version (ou vice-versa) é recusado pelo CHECK (M0/T4)", async () => {
    // Linha cancelada: fora do índice parcial de rascunho único, sem
    // interferir com os outros invariantes que correm em paralelo.
    // Lead/contato da mesma org passam no trigger da 0465.
    try {
      await expect(
        pool.query(`
          insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status, template_slug, template_version)
            values ('${PROP_CHECK}', '${GOV_ORG}', '${GOV_LEAD}', '${GOV_CONTACT_1}', 'invariante M0 CHECK', 'cancelada', 'institucional', null);
        `),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        pool.query(`
          insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status, template_slug, template_version)
            values ('${PROP_CHECK}', '${GOV_ORG}', '${GOV_LEAD}', '${GOV_CONTACT_1}', 'invariante M0 CHECK', 'cancelada', null, 3);
        `),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      sql(`delete from public.crm_proposals where id = '${PROP_CHECK}';`);
    }
  });
});
