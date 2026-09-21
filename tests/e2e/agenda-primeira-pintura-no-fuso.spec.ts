/**
 * A PRIMEIRA PINTURA DA AGENDA — a semana que o SERVIDOR desenha, antes de a
 * página ganhar vida.
 *
 * ═══ O defeito ══════════════════════════════════════════════════════════════
 *
 * `app/app/agenda/page.tsx` calculava a semana com `startOfWeek(new Date())`,
 * no fuso do PROCESSO — UTC num contêiner. Das 21h de sábado à meia-noite em
 * São Paulo, UTC já virou domingo: quem abria a Agenda via a SEMANA SEGUINTE
 * até a hidratação corrigir, e a consulta que o servidor adianta era feita para
 * o período errado.
 *
 * ═══ Por que bloquear o JavaScript é o método, e não um truque ══════════════
 *
 * Com a página viva, o cliente conserta a semana em milissegundos e o defeito
 * fica invisível para o teste — foi exatamente assim que ele sobreviveu. Sem os
 * pacotes da aplicação, o que fica na tela é o que o SERVIDOR mandou, que é o
 * que esta spec precisa medir.
 *
 * ═══ O que cada caso discrimina ═════════════════════════════════════════════
 *
 * O caso 1 compara a semana pintada com a semana daquele fuso no MESMO instante,
 * calculada aqui. Ele reprova de verdade quando o fuso configurado e o do
 * servidor discordam sobre a semana — a janela onde o defeito vivia. Fora dela
 * ele ainda afirma que a página abre e desenha sete dias, mas não separa os dois
 * cálculos: é o preço de não poder mexer no relógio do servidor, e está escrito
 * aqui para ninguém ler o verde como mais do que ele é. Quem separa os cálculos
 * em qualquer dia é `lib/agenda/semana-semente.test.ts`, com o instante fixo.
 *
 * O caso 2 não depende de janela nenhuma: fuso inutilizável no banco tem de
 * abrir a Agenda mesmo assim. `Intl.DateTimeFormat` LANÇA com fuso inválido, e
 * `organizations.timezone` não é validado por escritor nenhum — sem a falha
 * aberta, um acento no campo de configuração vira tela branca.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

/** Kiritimati (UTC+14) — o fuso mais adiantado do mundo, e o mais longe do CI. */
const FUSO_DA_ORG = "Pacific/Kiritimati";

/** O que alguém digita no campo de texto que ninguém valida. */
const FUSO_QUE_O_INTL_RECUSA = "São Paulo";

test.use({ trace: "on", timezoneId: FUSO_DA_ORG });

const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { persistSession: false },
});
const senha = `Local-${randomUUID()}!`;
const orgs: string[] = [];
const usuarios: string[] = [];

async function inserir(tabela: string, valor: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(tabela).insert(valor).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Organização PRÓPRIA: mexer no fuso da org compartilhada mudaria o relógio das irmãs. */
async function fixture(fuso: string) {
  const email = `fuso-${randomUUID()}@invariant.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw error;
  usuarios.push(data.user.id);

  const org = await inserir("organizations", {
    slug: `fuso-${randomUUID()}`,
    display_name: "Agenda no fuso de quem olha",
    legal_name: "Agenda no fuso de quem olha",
    timezone: fuso,
    onboarded_at: new Date().toISOString(),
  });
  orgs.push(org);

  await inserir("user_organizations", {
    organization_id: org,
    user_id: data.user.id,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  return { email };
}

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
}

/** O domingo da semana que contém `agora` naquele fuso, em `yyyy-MM-dd`. */
function domingoNoFuso(agora: Date, fuso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(agora);
  const campo = (t: string) => partes.find((p) => p.type === t)!.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(campo("weekday"));
  const dia = new Date(`${campo("year")}-${campo("month")}-${campo("day")}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - dow);
  return dia.toISOString().slice(0, 10);
}

test.afterAll(async () => {
  for (const org of orgs) await db.from("organizations").delete().eq("id", org);
  for (const id of usuarios) await db.auth.admin.deleteUser(id);
});

test("o servidor pinta a semana do fuso configurado — sem o JavaScript da aplicação", async ({
  page,
}) => {
  const { email } = await fixture(FUSO_DA_ORG);
  await entrar(page, email); // o login precisa da página viva

  // A partir daqui a aplicação não recebe mais JavaScript.
  await page.route("**/_next/static/chunks/**", (rota) => rota.abort());
  const abertaEm = new Date();
  await page.goto("/app/agenda");

  const dias = await page
    .locator('[data-testid^="coluna-dia-"]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")!.replace("coluna-dia-", "")).sort(),
    );

  expect(
    dias,
    "o servidor não desenhou a semana — sem sete colunas não há o que medir",
  ).toHaveLength(7);
  expect(dias[0], `a primeira pintura veio na semana do SERVIDOR, não na de ${FUSO_DA_ORG}`).toBe(
    domingoNoFuso(abertaEm, FUSO_DA_ORG),
  );
});

test("fuso inutilizável no banco não derruba a tela — ela abre no padrão do produto", async ({
  page,
}) => {
  const { email } = await fixture(FUSO_QUE_O_INTL_RECUSA);
  await entrar(page, email);
  await page.goto("/app/agenda");

  await expect(
    page.getByTestId("tela-agenda"),
    `com ${FUSO_QUE_O_INTL_RECUSA} gravado, a Agenda não abriu — a escada de fuso deixou de falhar aberta`,
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="coluna-dia-"]').first()).toBeAttached();
});
