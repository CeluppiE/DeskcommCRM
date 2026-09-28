/**
 * OS CONTADORES DO MENU — a prova pela tela (DoD 12).
 *
 * O que muda para quem opera: "Casos" sobe para o menu da IA com o número de
 * casos em que a IA espera uma PESSOA, e "Inbox" ganha o número de conversas
 * que esperam uma pessoa (a aba Fila). Medido numa loja que vende pelo
 * WhatsApp: a IA abriu um caso e passou duas conversas para a equipe numa
 * manhã, e o dono só soube abrindo cada tela e procurando.
 *
 * O que esta spec afirma, e a régua de cada afirmação:
 *
 *   1. O número do menu é o MESMO da tela que ele resume — a lista de Casos
 *      (itens "Aguardando você") e a aba Fila do Inbox. Um contador que diverge
 *      da tela manda a pessoa procurar trabalho que não existe.
 *   2. O número ACOMPANHA o estado: um caso a mais e ele sobe; o caso fechado e
 *      ele desce. Uma conversa a menos na fila e ele desce.
 *   3. Zero não desenha nada.
 *   4. O selo mora DENTRO do item e não quebra a linha (a altura do item é a do
 *      vizinho sem selo) — medido por `getBoundingClientRect`, nunca a olho.
 *
 * Que o menu inteiro continua cabendo em 900px com "Casos" no lugar de
 * "Roteadores" é o `navegacao.spec.ts` que mede.
 *
 * Semeia o PRÓPRIO estado pelo service role (canal, contato, conversa escalada
 * e caso) e apaga tudo no fim: a organização de teste é compartilhada, e uma
 * spec que dependesse do caso da `seed-e2e-escalacao` passaria ou falharia
 * conforme a ordem das vizinhas que o respondem.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { expect, test, type Page } from "./helpers/test";

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EVIDENCIA = path.join(process.cwd(), "evidence", "contadores-no-menu");
const ESPERA = 60_000;

/** Nomes próprios e improváveis: a organização de teste é compartilhada. */
const CONTATO = "Quirino Contador-do-Menu";
const TITULO_DO_CASO = "Contador do menu — caso de teste";
const SESSAO = "aaaaaaaa-e2e0-4000-8000-00000000ab21";

let orgId = "";
let conversaId = "";
let casoId = "";

async function limpar(): Promise<void> {
  if (!orgId) return;
  await admin.from("agent_cases").delete().eq("organization_id", orgId).eq("title", TITULO_DO_CASO);
  const { data } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("display_name", CONTATO);
  for (const c of data ?? []) {
    const id = (c as { id: string }).id;
    await admin.from("conversations").delete().eq("organization_id", orgId).eq("contact_id", id);
    await admin.from("contacts").delete().eq("organization_id", orgId).eq("id", id);
  }
  await admin.from("channel_sessions").delete().eq("organization_id", orgId).eq("id", SESSAO);
}

async function semear(): Promise<void> {
  await limpar();
  const { error: eSess } = await admin.from("channel_sessions").insert({
    id: SESSAO,
    organization_id: orgId,
    waha_session_name: `contadores-do-menu-${Date.now()}`,
    webhook_secret_encrypted: "\\x00",
    status: "WORKING",
  });
  if (eSess) throw new Error(`fixture de canal falhou: ${eSess.message}`);

  const { data: ct, error: eCt } = await admin
    .from("contacts")
    .insert({ organization_id: orgId, display_name: CONTATO })
    .select("id")
    .single();
  if (eCt) throw new Error(`fixture de contato falhou: ${eCt.message}`);

  // Escalada: o silêncio sem fim e ninguém dono é o que põe a conversa
  // esperando uma PESSOA — a Fila (`comandosDaFila`), com ou sem automático.
  const agora = new Date().toISOString();
  const { data: conv, error: eConv } = await admin
    .from("conversations")
    .insert({
      organization_id: orgId,
      contact_id: (ct as { id: string }).id,
      channel_session_id: SESSAO,
      status: "open",
      assigned_to_user_id: null,
      bot_silenced_until: "infinity",
      last_inbound_at: agora,
      last_message_at: agora,
      last_message_preview: "mensagem de teste",
    })
    .select("id")
    .single();
  if (eConv) throw new Error(`fixture de conversa falhou: ${eConv.message}`);
  conversaId = (conv as { id: string }).id;
}

async function abrirCaso(): Promise<void> {
  const { data, error } = await admin
    .from("agent_cases")
    .insert({
      organization_id: orgId,
      conversation_id: conversaId,
      status: "awaiting_human",
      title: TITULO_DO_CASO,
      summary: "O cliente pergunta o prazo de entrega.",
      blocker: "A IA não sabe a transportadora do pedido.",
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture de caso falhou: ${error.message}`);
  casoId = (data as { id: string }).id;
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });
const itemDoMenu = (page: Page, href: string) => sidebar(page).locator(`a[href="${href}"]`);

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  // Captura da JANELA: `fullPage` mente sobre a posição do menu, que é fixo.
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`) });
}

/** Quantos itens da lista de Casos (abertos) esperam uma pessoa. */
async function casosEsperandoNaTela(page: Page): Promise<number> {
  return page.getByTestId("case-item").filter({ hasText: "Aguardando você" }).count();
}

/**
 * Abre a lista de Casos e espera o caso semeado aparecer (ou sumir). Recarrega
 * até três vezes: sob carga, o serviço de autenticação engasga e a lista volta
 * vazia — o mesmo motivo, medido, de `conversa-do-caso.spec.ts`.
 */
async function abrirCasos(page: Page, casoVisivel: boolean): Promise<void> {
  let ultimo = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto("/app/ai/cases");
    try {
      // "Abertos (N)" só aparece com a lista CARREGADA — antes disso, contar
      // itens mediria o esqueleto.
      await expect(page.getByRole("tab", { name: /^Abertos \(\d+\)$/ })).toBeVisible({ timeout: 20_000 });
      const alvo = page.getByTestId("case-item").filter({ hasText: TITULO_DO_CASO });
      await expect(alvo).toHaveCount(casoVisivel ? 1 : 0, { timeout: 20_000 });
      return;
    } catch (erro) {
      ultimo = erro instanceof Error ? erro.message : String(erro);
    }
  }
  throw new Error(`a lista de Casos não chegou ao estado esperado em 3 tentativas — ${ultimo}`);
}

function gravarMedidas(nome: string, medidas: Record<string, unknown>): void {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCIA, `${nome}.json`), `${JSON.stringify(medidas, null, 2)}\n`);
}

/**
 * A folga do menu em 1280×900: distância entre o fim do último grupo e o fim da
 * caixa de conteúdo da `<nav>`. O `scrollHeight` não a revela (é grampeado no
 * `clientHeight` quando cabe) — a régua é a de `docs/testing/user-journey-map.md`,
 * "O menu inteiro cabe na dobra de um notebook?". Informativa: quem REPROVA o
 * menu que rola é `navegacao.spec.ts`.
 */
async function folgaDoMenu(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
    const cs = getComputedStyle(nav);
    const fimDaCaixa =
      nav.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
    const filhos = [...nav.children].map((c) => c.getBoundingClientRect().bottom);
    return Math.round(fimDaCaixa - Math.max(...filhos));
  });
}

/** Medida por ferramenta: o selo dentro do item, sem quebrar a linha. */
async function medirSelo(page: Page, href: string, testId: string, vizinho: string) {
  return page.evaluate(
    ({ href, testId, vizinho }) => {
      const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
      const link = nav.querySelector(`a[href="${href}"]`)!;
      const selo = link.querySelector(`[data-testid="${testId}"]`)!;
      const outro = nav.querySelector(`a[href="${vizinho}"]`)!;
      const l = link.getBoundingClientRect();
      const s = selo.getBoundingClientRect();
      const o = outro.getBoundingClientRect();
      return {
        dentro: s.left >= l.left && s.right <= l.right + 0.5 && s.top >= l.top && s.bottom <= l.bottom + 0.5,
        alturaDoItem: Math.round(l.height),
        alturaDoVizinho: Math.round(o.height),
        fundo: getComputedStyle(selo).backgroundColor,
      };
    },
    { href, testId, vizinho },
  );
}

test.describe("contadores do menu", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async () => {
    orgId = (lerCreds() as unknown as { org_id: string }).org_id;
    await semear();
  });

  test.afterAll(async () => {
    await limpar();
  });

  test("Casos mostra quantos esperam uma pessoa — o mesmo número da tela, e acompanha o caso", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginComoAdmin(page, lerCreds());

    // Antes do caso: o número (se houver) é o da lista.
    await abrirCasos(page, false);
    const antes = await casosEsperandoNaTela(page);
    const seloDeCasos = itemDoMenu(page, "/app/ai/cases").getByTestId("contador-de-casos");
    if (antes === 0) await expect(seloDeCasos, "zero não desenha nada").toHaveCount(0);
    else await expect(seloDeCasos).toHaveText(String(antes), { timeout: ESPERA });

    // A IA abre um caso esperando uma pessoa: o número sobe, e continua sendo o
    // da lista.
    await abrirCaso();
    await abrirCasos(page, true);
    const comOCaso = await casosEsperandoNaTela(page);
    expect(comOCaso, "o caso semeado entra na lista como esperando uma pessoa").toBe(antes + 1);
    await expect(seloDeCasos).toHaveText(String(comOCaso), { timeout: ESPERA });

    const m = await medirSelo(page, "/app/ai/cases", "contador-de-casos", "/app/ai/agents");
    expect(m.dentro, "o selo precisa morar dentro do item de Casos").toBe(true);
    expect(m.alturaDoItem, "o selo não pode quebrar a linha do item").toBe(m.alturaDoVizinho);
    expect(m.fundo, "o selo precisa ter fundo próprio para ser lido").not.toBe("rgba(0, 0, 0, 0)");
    await captura(page, "01-casos-com-contador");
    gravarMedidas("medidas-casos", {
      viewport: "1280x900",
      casos_esperando_antes: antes,
      casos_esperando_com_o_caso: comOCaso,
      selo: m,
      folga_do_menu_px: await folgaDoMenu(page),
      menu_rola: await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
        return nav.scrollHeight > Math.round(nav.getBoundingClientRect().height) + 1;
      }),
    });

    // O caso fecha: o número desce junto com a lista.
    const { error } = await admin
      .from("agent_cases")
      .update({ status: "resolved", closed_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("id", casoId);
    if (error) throw new Error(`fechar o caso falhou: ${error.message}`);
    await abrirCasos(page, false);
    const depois = await casosEsperandoNaTela(page);
    expect(depois).toBe(antes);
    if (depois === 0) await expect(seloDeCasos, "zero não desenha nada").toHaveCount(0, { timeout: ESPERA });
    else await expect(seloDeCasos).toHaveText(String(depois), { timeout: ESPERA });
    await captura(page, "02-casos-depois-de-fechar");
  });

  test("Inbox mostra quantas conversas esperam uma pessoa — o mesmo número da aba Fila", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginComoAdmin(page, lerCreds());

    await page.goto("/app/inbox");
    await expect(page.getByText(CONTATO).first()).toBeVisible({ timeout: ESPERA });

    // O número da aba Fila entra no nome acessível ("Fila 3"); sem número, a aba
    // é só "Fila".
    const abaFila = page.getByRole("tab", { name: /^Fila/ }).first();
    await expect(abaFila).toHaveText(/^Fila\s*\d+$/, { timeout: ESPERA });
    const naAba = Number((await abaFila.textContent())!.replace(/\D/g, ""));
    expect(naAba, "a conversa escalada semeada está na Fila").toBeGreaterThan(0);

    const seloDaFila = itemDoMenu(page, "/app/inbox").getByTestId("contador-da-fila");
    await expect(seloDaFila).toHaveText(String(naAba), { timeout: ESPERA });

    const m = await medirSelo(page, "/app/inbox", "contador-da-fila", "/app/radar");
    expect(m.dentro, "o selo precisa morar dentro do item de Inbox").toBe(true);
    expect(m.alturaDoItem, "o selo não pode quebrar a linha do item").toBe(m.alturaDoVizinho);
    await captura(page, "03-inbox-com-contador-da-fila");
    gravarMedidas("medidas-fila", { viewport: "1280x900", fila_na_aba: naAba, selo: m });

    // A conversa semeada deixa de existir: o número desce, igual à aba.
    const { error } = await admin
      .from("conversations")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", conversaId);
    if (error) throw new Error(`tirar a conversa da fila falhou: ${error.message}`);

    await page.reload();
    await expect(abaFila).toBeVisible({ timeout: ESPERA });
    const depois = naAba - 1;
    if (depois === 0) {
      await expect(abaFila).toHaveText(/^Fila$/, { timeout: ESPERA });
      await expect(seloDaFila, "zero não desenha nada").toHaveCount(0, { timeout: ESPERA });
    } else {
      await expect(abaFila).toHaveText(new RegExp(`^Fila\\s*${depois}$`), { timeout: ESPERA });
      await expect(seloDaFila).toHaveText(String(depois), { timeout: ESPERA });
    }
    await captura(page, "04-inbox-depois-de-sair-da-fila");
  });
});
