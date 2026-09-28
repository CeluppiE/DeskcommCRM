import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONTACT_1, GOV_LEAD, GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

/**
 * Uma proposta de uma organização não pode apontar para negócio, contato ou
 * conversa de outra (migration 0465). A RLS confere só o `organization_id` da
 * PRÓPRIA linha; sem o trigger, um usuário da organização vizinha gravava pela
 * API do banco uma proposta dela com o negócio desta.
 */
const ORG_VIZINHA = "cccccccc-9999-4000-8000-000000000398";
const CONTATO_VIZINHO = "cccccccc-9999-4000-8000-000000000399";

function inserir(org: string, lead: string, contato: string): string {
  // Embrulhado num SELECT: com `psql -tA` um INSERT...RETURNING cru imprime
  // também a tag "INSERT 0 1", e `lastLine` leria a tag em vez do id.
  return sql(`
    with p as (
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo)
        values ('${org}', '${lead}', '${contato}', 'invariante 0398')
        returning id
    )
    select id from p;
  `);
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_VIZINHA}', 'gov-inv-0398', 'Gov 0398', 'Gov 0398')
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO_VIZINHO}', '${ORG_VIZINHA}', 'Vizinho 0398')
      on conflict do nothing;
    delete from public.crm_proposals where titulo = 'invariante 0398';
  `);
});

describe("a proposta não atravessa a organização", () => {
  it("controle positivo: negócio e contato da própria organização gravam", () => {
    const id = lastLine(inserir(GOV_ORG, GOV_LEAD, GOV_CONTACT_1));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    sql(`delete from public.crm_proposals where id = '${id}';`);
  });

  it("negócio de outra organização: recusado", () => {
    expect(() => inserir(ORG_VIZINHA, GOV_LEAD, CONTATO_VIZINHO)).toThrow(/crm_proposal_lead_org_mismatch/);
  });

  it("contato de outra organização: recusado", () => {
    expect(() => inserir(GOV_ORG, GOV_LEAD, CONTATO_VIZINHO)).toThrow(/crm_proposal_contact_org_mismatch/);
  });

  it("UPDATE que troca o negócio por um de outra organização: recusado", () => {
    const id = lastLine(inserir(GOV_ORG, GOV_LEAD, GOV_CONTACT_1));
    try {
      expect(() =>
        sql(`update public.crm_proposals set organization_id = '${ORG_VIZINHA}' where id = '${id}';`),
      ).toThrow(/crm_proposal_lead_org_mismatch/);
    } finally {
      sql(`delete from public.crm_proposals where id = '${id}';`);
    }
  });
});
