import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `crm_proposal_counters` (migration 0466, D9) É SERVER-SIDE ONLY — E ISSO SE MEDE.
 *
 * Achado do CI (`tests/invariants/rls-completude-varredura.test.ts`): a tabela
 * não estava nem em `TABLES` (rls-isolation.test.ts) nem em `PROVA_PROPRIA`.
 *
 * Por que ela NÃO entra em `TABLES`: aquele teste pergunta "o usuário da org A
 * vê ZERO linhas da org B" — pressupõe que `authenticated` ALCANÇA a tabela e
 * é filtrado por policy. Aqui `authenticated` não alcança coisa nenhuma: RLS
 * ligada, ZERO policies, `revoke all ... from anon, authenticated` (baseline,
 * bloco da migration 0466). Rodar o molde de lá devolveria `permission
 * denied` em vez de `0`, e a "correção" natural seria criar uma policy — ou
 * seja, passar a servir pelo PostgREST o contador que decide a numeração
 * jurídica da proposta (D9: reemitir um número já é o incidente que esta
 * tabela existe para impedir).
 */

const TABELA = "crm_proposal_counters";

function erroSob(papel: string, comando: string): string | null {
  try {
    sql(`set role ${papel};\n${comando};\nreset role;`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function esperaBarrado(papel: string, comando: string): void {
  const erro = erroSob(papel, comando);
  expect(erro, `\`${papel}\` executou "${comando}" SEM erro — a tabela está exposta`).not.toBeNull();
  expect(erro).toContain("permission denied");
}

describe(`o PostgREST não serve \`${TABELA}\``, () => {
  it("`authenticated` é BARRADO ao ler — permission denied, não zero linhas", () => {
    esperaBarrado("authenticated", `select * from public.${TABELA} limit 1`);
  });

  it("`authenticated` é BARRADO ao escrever", () => {
    esperaBarrado(
      "authenticated",
      `insert into public.${TABELA} (organization_id, ano, ultimo_numero) values (gen_random_uuid(), 2099, 1)`,
    );
  });

  it("`anon` é BARRADO ao ler — permission denied, não zero linhas", () => {
    esperaBarrado("anon", `select * from public.${TABELA} limit 1`);
  });

  it("RLS continua LIGADA na tabela (a ausência de policy não é a única trava)", () => {
    const ligada = sql(`
      select relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = '${TABELA}';
    `).trim();
    expect(ligada).toBe("t");
  });
});
