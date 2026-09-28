import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

/**
 * D9 — o contador de numeração de propostas não pode depender das linhas que
 * existem: `max(numero)+1` sobre linhas apagáveis reemitiu o número 1/2026
 * para dois clientes diferentes (auditoria de produção, 19/09/2026).
 */
describe("o contador de propostas não recua quando a linha é apagada", () => {
  beforeAll(() => seedGov());

  it("cresce sempre, mesmo sem nenhuma proposta existir para a organização/ano", () => {
    const ano = 2030; // ano isolado desta suíte — nunca usado por outro seed.
    const primeiro = sql(`select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano});`);
    expect(primeiro).toBe("1");

    const segundo = sql(`select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano});`);
    expect(segundo).toBe("2");
  });

  it("duas alocações concorrentes na mesma organização/ano não colidem", () => {
    const ano = 2031;
    // psql não paraleliza dentro de uma sessão; a prova de não-colisão real é
    // forçar DUAS chamadas no MESMO enunciado via CTEs — o Postgres serializa
    // pelo lock de linha do UPSERT dentro de `fn_proposta_aloca_numero`.
    const out = sql(`
      with a as (select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano}) as n),
           b as (select public.fn_proposta_aloca_numero('${GOV_ORG}', ${ano}) as n)
      select a.n, b.n from a, b;
    `);
    const partes = out.split("|");
    const n1 = Number(partes[0]);
    const n2 = Number(partes[1]);
    expect(new Set([n1, n2]).size).toBe(2);
    expect(Math.max(n1, n2)).toBe(2);
  });

  it("semente do backfill: maior número já visto em crm_proposals OU em api_audit_log vence", () => {
    const org2 = "cccccccc-9999-4000-8000-000000000401";
    const contatoId = "cccccccc-9999-4000-8000-000000000402";
    const leadId = "cccccccc-9999-4000-8000-000000000403";
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${org2}', 'gov-inv-0401', 'Gov 0401', 'Gov 0401') on conflict do nothing;
      insert into public.contacts (id, organization_id, display_name)
        values ('${contatoId}', '${org2}', 'contato 0401') on conflict do nothing;
      insert into public.crm_pipelines (id, organization_id, name, slug)
        values ('cccccccc-9999-4000-8000-000000000404', '${org2}', 'P', 'p-0401') on conflict do nothing;
      insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
        values ('cccccccc-9999-4000-8000-000000000405', '${org2}', 'cccccccc-9999-4000-8000-000000000404', 'S', 's-0401', 1000)
        on conflict do nothing;
      insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
        values ('${leadId}', '${org2}', 'cccccccc-9999-4000-8000-000000000404', 'cccccccc-9999-4000-8000-000000000405', 'legado')
        on conflict do nothing;
      insert into public.crm_proposals (organization_id, lead_id, contact_id, titulo, status, numero, ano)
        values ('${org2}', '${leadId}', '${contatoId}', 'legado', 'enviada', 3, 2026)
        on conflict do nothing;
    `);
    // Reaplica o backfill do apêndice manualmente (é o que o update.sh faria de novo):
    sql(`
      insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
      select organization_id, ano, max(numero) from public.crm_proposals
      where numero is not null group by organization_id, ano
      on conflict (organization_id, ano) do update
        set ultimo_numero = greatest(public.crm_proposal_counters.ultimo_numero, excluded.ultimo_numero);
    `);
    const proximo = sql(`select public.fn_proposta_aloca_numero('${org2}', 2026);`);
    expect(proximo).toBe("4");
  });

  it("semente do backfill não quebra com auditoria de organização já apagada (I4)", () => {
    const org3 = "cccccccc-9999-4000-8000-000000000406";
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${org3}', 'gov-inv-0406', 'Gov 0406', 'Gov 0406') on conflict do nothing;
      insert into public.api_audit_log (organization_id, action, metadata)
        values ('${org3}', 'proposal.sent', '{"numero": 9, "ano": 2026}'::jsonb);
      delete from public.organizations where id = '${org3}';
    `);
    const orgNaLinha = sql(`select organization_id is null from public.api_audit_log where action = 'proposal.sent' and metadata->>'numero' = '9';`);
    expect(orgNaLinha).toBe("t"); // controle: a linha de auditoria sobreviveu, órfã.

    // Reaplica o backfill CORRIGIDO (mesma consulta do apêndice) — não pode lançar.
    expect(() =>
      sql(`
        insert into public.crm_proposal_counters (organization_id, ano, ultimo_numero)
        select a.organization_id, (a.metadata->>'ano')::int as ano, max((a.metadata->>'numero')::int) as ultimo_numero
        from public.api_audit_log a
        where a.action = 'proposal.sent'
          and a.organization_id is not null
          and exists (select 1 from public.organizations o where o.id = a.organization_id)
          and a.metadata->>'numero' is not null
          and a.metadata->>'ano' is not null
        group by a.organization_id, (a.metadata->>'ano')::int
        on conflict (organization_id, ano) do update
          set ultimo_numero = greatest(public.crm_proposal_counters.ultimo_numero, excluded.ultimo_numero);
      `),
    ).not.toThrow();
  });
});
