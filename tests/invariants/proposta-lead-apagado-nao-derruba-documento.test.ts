import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONTACT_1, GOV_ORG, GOV_PIPELINE, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * D10 — apagar o negócio não pode apagar em cascata uma proposta já enviada
 * ao cliente (anti-pattern 7, "cascata fantasma"). Rascunho é diferente: não
 * tem valor fora do negócio, e vira `cancelada` (trigger
 * `trg_crm_leads_cancelar_propostas_rascunho`, migration 0401).
 */
describe("apagar o negócio não apaga a proposta enviada", () => {
  beforeAll(() => seedGov());

  it("proposta enviada sobrevive; lead_id vira null", () => {
    const leadId = "cccccccc-9999-4000-8000-000000000410";
    const propostaId = "cccccccc-9999-4000-8000-000000000411";
    sql(`
      insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
        values ('${leadId}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'para apagar (enviada)');
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, destinatario_nome)
        values ('${propostaId}', '${GOV_ORG}', '${leadId}', '${GOV_CONTACT_1}', 'sobrevive', 'enviada', 999, 2026, 'Fulano de Tal');
      delete from public.crm_leads where id = '${leadId}';
    `);

    const status = sql(`select status from public.crm_proposals where id = '${propostaId}';`);
    const leadNulo = sql(`select lead_id is null from public.crm_proposals where id = '${propostaId}';`);
    expect(status).toBe("enviada");
    expect(leadNulo).toBe("t");

    sql(`delete from public.crm_proposals where id = '${propostaId}';`);
  });

  it("rascunho vira cancelada quando o negócio é apagado", () => {
    const leadId = "cccccccc-9999-4000-8000-000000000412";
    const propostaId = "cccccccc-9999-4000-8000-000000000413";
    sql(`
      insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
        values ('${leadId}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'para apagar (rascunho)');
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status)
        values ('${propostaId}', '${GOV_ORG}', '${leadId}', '${GOV_CONTACT_1}', 'rascunho a cancelar', 'rascunho');
      delete from public.crm_leads where id = '${leadId}';
    `);
    const status = sql(`select status from public.crm_proposals where id = '${propostaId}';`);
    expect(status).toBe("cancelada");

    sql(`delete from public.crm_proposals where id = '${propostaId}';`);
  });

  it("apagar o contato também não derruba a proposta enviada", () => {
    const contatoId = "cccccccc-9999-4000-8000-000000000414";
    const leadId = "cccccccc-9999-4000-8000-000000000415";
    const propostaId = "cccccccc-9999-4000-8000-000000000416";
    sql(`
      insert into public.contacts (id, organization_id, display_name)
        values ('${contatoId}', '${GOV_ORG}', 'contato a apagar');
      insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
        values ('${leadId}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'negocio do contato apagado');
      insert into public.crm_proposals (id, organization_id, lead_id, contact_id, titulo, status, numero, ano, destinatario_nome)
        values ('${propostaId}', '${GOV_ORG}', '${leadId}', '${contatoId}', 'sobrevive 2', 'enviada', 998, 2026, 'Ciclano');
      delete from public.contacts where id = '${contatoId}';
    `);
    const status = sql(`select status from public.crm_proposals where id = '${propostaId}';`);
    const contatoNulo = sql(`select contact_id is null from public.crm_proposals where id = '${propostaId}';`);
    expect(status).toBe("enviada");
    expect(contatoNulo).toBe("t");

    sql(`delete from public.crm_proposals where id = '${propostaId}'; delete from public.crm_leads where id = '${leadId}';`);
  });
});
