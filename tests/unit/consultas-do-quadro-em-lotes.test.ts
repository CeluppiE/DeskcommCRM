/**
 * Consultas do quadro (`/api/v1/pipelines/[id]/board`) que escalam com o
 * tamanho do funil — uma linha por lead ou por contato — têm que ir em LOTES
 * (`emLotes`, teto de 100 ids por chamada), nunca `.in()` direto na lista
 * inteira.
 *
 * Por quê: o filtro `.in()` vai na querystring do PostgREST. Um funil grande
 * o bastante estoura o limite de cabeçalho do proxy na frente do Supabase, a
 * conexão cai crua, e o `fetch` do Node (por baixo do supabase-js) sobe
 * `TypeError: fetch failed` — sem status, sem corpo, indistinguível de "o
 * Supabase caiu" pra quem olha o erro na tela. Foi o que aconteceu no funil
 * "Disparo" com 500 leads (documentado no topo do arquivo da rota, comentário
 * de `LOTE_DE_IDS`) — e de novo com 1003, porque duas consultas ficaram de
 * fora do lote na primeira correção.
 *
 * Teste por leitura de fonte, no mesmo estilo do teste-irmão
 * (`funil-mostra-dados-do-cliente.test.tsx`, describe "a fiação — quem usa a
 * regra a chama"): a rota não exporta essas funções internas, e simular a
 * cadeia inteira do supabase-js só para provar "isto passa por emLotes" seria
 * mais frágil que ler o texto — acoplaria o teste à forma exata da cadeia
 * encadeada em vez do que importa, que é: existe UM caminho pra consultas que
 * escalam com o funil, e é o do helper.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROTA = "app/api/v1/pipelines/[id]/board/route.ts";
const fonte = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

/** O corpo de uma função de nível de módulo, da assinatura até a próxima `async function`. */
function corpoDaFuncao(rota: string, nomeDaFuncao: string): string {
  const inicio = rota.indexOf(`async function ${nomeDaFuncao}`);
  expect(inicio, `${nomeDaFuncao} sumiu da rota`).toBeGreaterThan(-1);
  const resto = rota.slice(inicio + 1);
  const proximaFn = resto.search(/\nasync function /);
  return proximaFn === -1 ? rota.slice(inicio) : rota.slice(inicio, inicio + 1 + proximaFn);
}

describe("consultas do quadro que escalam com o funil vão em lotes", () => {
  const rota = fonte(ROTA);

  it("⭐ withMarcadoresDoContato busca os contatos via emLotes, não .in() direto", () => {
    const corpo = corpoDaFuncao(rota, "withMarcadoresDoContato");
    expect(
      corpo,
      "contactIds está indo direto num .in() sem lote — estoura a URL do PostgREST em funis grandes (era exatamente isto no incidente do funil 'Disparo')",
    ).not.toMatch(/\.in\(\s*"id",\s*contactIds\s*\)/);
    expect(corpo, "a busca de contatos não passa pelo helper emLotes").toMatch(
      // emLotes aceita generics antes do "(" — mesmo padrão de withScores: `emLotes<{...}>(contactIds, ...)`
      /emLotes(<[\s\S]*?>)?\(\s*contactIds\s*,/,
    );
  });

  it("⭐ avisaAmbiguas busca os itens de inbox via emLotes, não .in() direto", () => {
    const corpo = corpoDaFuncao(rota, "avisaAmbiguas");
    expect(
      corpo,
      "a lista de contact_id das propostas ambíguas está indo direto num .in() sem lote",
    ).not.toMatch(/\.in\(\s*"ref_id",\s*ambiguas\.map/);
    expect(corpo, "avisaAmbiguas não passa pelo helper emLotes").toMatch(/emLotes[(<]/);
  });

  it("as quatro consultas já corrigidas continuam passando por emLotes (não regride)", () => {
    // withScores, withConversas, withNextActions×2 já usam `lote` — isto é uma
    // rede de segurança contra alguém "simplificar de volta" pra `.in()` direto
    // num refactor futuro sem perceber a regra.
    const ocorrencias = rota.match(/\.in\(\s*"[a-z_]+",\s*lote\s*\)/g) ?? [];
    expect(
      ocorrencias.length,
      "esperava pelo menos as 4 consultas já batizadas com `lote` de antes deste fix",
    ).toBeGreaterThanOrEqual(4);
  });
});
