import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

/**
 * ANONIMIZAR O CONTATO EXPURGA O PDF DA PROPOSTA (migration 0477).
 *
 * O PDF enviado ao cliente (`propostas/<org>/<proposta>.pdf`) leva o nome dele
 * impresso. A 0477 redigia `destinatario_nome`, `briefing_json` e
 * `resumo_comercial` e deixava o ARQUIVO no Storage — e o texto do documento
 * em `rendered_snapshot`/`secoes_editadas`. Anonimizar devolvia SUCESSO com o
 * documento intacto. O passo 7 da cascata não o pegava: ele só enfileira o
 * bucket `whatsapp-media`, e o PDF mora em `propostas`.
 *
 * O vizinho é o controle: a proposta de OUTRO contato não pode perder nada.
 */
const ALVO = "cccccccc-3333-4000-8000-000000004771";
const VIZINHO = "cccccccc-3333-4000-8000-000000004772";
const P_ALVO = "cccccccc-9999-4000-8000-000000004771";
const P_ALVO_V2 = "cccccccc-9999-4000-8000-000000004773";
const P_VIZINHO = "cccccccc-9999-4000-8000-000000004772";
const P_CAMINHO_ALHEIO = "cccccccc-9999-4000-8000-000000004774";
const CAMINHO_DE_OUTRA_ORG = "dddddddd-0000-4000-8000-000000000001/p.pdf";
const NOME = "Joana Prudente Ramos";

function fila(caminho: string): string {
  return sql(`
    select count(*) from public.storage_redaction_queue
     where bucket = 'propostas' and object_path = '${caminho}' and status = 'pending';
  `);
}

function residuo(proposta: string): string {
  return sql(`
    select concat_ws(',',
      case when pdf_path is not null then 'pdf_path' end,
      case when rendered_snapshot::text ilike '%Joana%' then 'rendered_snapshot' end,
      case when secoes_editadas::text ilike '%Joana%' then 'secoes_editadas' end,
      case when destinatario_nome ilike '%Joana%' then 'destinatario_nome' end)
      from public.crm_proposals where id = '${proposta}';
  `);
}

beforeAll(() => {
  seedGov();
  sql(`
    delete from public.storage_redaction_queue where bucket = 'propostas' and (object_path like '${GOV_ORG}/%' or object_path = '${CAMINHO_DE_OUTRA_ORG}');
    delete from public.crm_proposals where id in ('${P_ALVO}', '${P_ALVO_V2}', '${P_VIZINHO}', '${P_CAMINHO_ALHEIO}');
    delete from public.contacts where id in ('${ALVO}', '${VIZINHO}');
    insert into public.contacts (id, organization_id, name, display_name)
      values ('${ALVO}', '${GOV_ORG}', '${NOME}', '${NOME}'),
             ('${VIZINHO}', '${GOV_ORG}', '${NOME}', '${NOME}');
    insert into public.crm_proposals
      (id, organization_id, contact_id, titulo, status, numero, ano, versao, destinatario_nome, pdf_path, rendered_snapshot, secoes_editadas)
    values
      ('${P_ALVO}', '${GOV_ORG}', '${ALVO}', 'v1', 'substituida', 4771, 2026, 1, '${NOME}',
        '${GOV_ORG}/${P_ALVO}.pdf', '{"secoes":[{"texto":"Prezada ${NOME}"}]}'::jsonb, '{"abertura":"Olá ${NOME}"}'::jsonb),
      ('${P_ALVO_V2}', '${GOV_ORG}', '${ALVO}', 'v2', 'enviada', 4771, 2026, 2, '${NOME}',
        '${GOV_ORG}/${P_ALVO_V2}.pdf', '{"secoes":[{"texto":"Prezada ${NOME}"}]}'::jsonb, null),
      ('${P_VIZINHO}', '${GOV_ORG}', '${VIZINHO}', 'vizinho', 'enviada', 4772, 2026, 1, '${NOME}',
        '${GOV_ORG}/${P_VIZINHO}.pdf', '{"secoes":[{"texto":"Prezada ${NOME}"}]}'::jsonb, null),
      -- caminho gravado apontando para OUTRA organização (a sessão já não
      -- consegue gravar isso — 0464 —, mas o expurgo não confia nisso)
      ('${P_CAMINHO_ALHEIO}', '${GOV_ORG}', '${ALVO}', 'alheio', 'rascunho', null, null, 1, '${NOME}',
        '${CAMINHO_DE_OUTRA_ORG}', null, null);
  `);
});

describe("anonimizar o contato expurga o PDF da proposta", () => {
  it("ANTES: o nome está no documento e nada está na fila (controle positivo)", () => {
    expect(residuo(P_ALVO)).toBe("pdf_path,rendered_snapshot,secoes_editadas,destinatario_nome");
    expect(fila(`${GOV_ORG}/${P_ALVO}.pdf`)).toBe("0");
  });

  it("⭐ o PDF de TODA versão entra na fila do bucket propostas e o texto do documento sai", () => {
    sql(`select public.fn_lgpd_cascade_redact_contact('${GOV_ORG}', '${ALVO}', null);`);
    expect(fila(`${GOV_ORG}/${P_ALVO}.pdf`)).toBe("1");
    expect(fila(`${GOV_ORG}/${P_ALVO_V2}.pdf`)).toBe("1");
    expect(residuo(P_ALVO)).toBe("");
    expect(residuo(P_ALVO_V2)).toBe("");
  });

  it("o expurgo nunca alcança um arquivo fora da pasta da organização", () => {
    expect(fila(CAMINHO_DE_OUTRA_ORG)).toBe("0");
  });

  it("a proposta de outro contato fica intacta", () => {
    expect(fila(`${GOV_ORG}/${P_VIZINHO}.pdf`)).toBe("0");
    expect(residuo(P_VIZINHO)).toBe("pdf_path,rendered_snapshot,destinatario_nome");
  });
});
