/**
 * Consultas do quadro (`/api/v1/pipelines/[id]/board`) que escalam com o
 * tamanho do funil — uma linha por lead ou por contato — têm que ir em LOTES
 * (`buscaEmLotes`, de `lib/supabase/em-lotes.ts`, teto de 100 ids por chamada),
 * nunca `.in()` direto na lista inteira.
 *
 * Por quê: o filtro `.in()` vai na querystring do PostgREST. Um funil grande
 * o bastante estoura o limite de cabeçalho entre o Supabase e o Node, e o
 * `fetch` (por baixo do supabase-js) sobe `TypeError: fetch failed` — sem
 * status, sem corpo, indistinguível de "o Supabase caiu" pra quem olha o erro
 * na tela. Foi o que aconteceu no funil "Disparo" com 500 leads — e de novo
 * com 1003, porque duas consultas ficaram de fora do lote na primeira correção.
 *
 * O helper próprio do fork (`emLotes`) foi substituído no merge da v1.60.0
 * pelo do upstream (`buscaEmLotes`), que resolve o mesmo problema. O teste do
 * helper mora ao lado dele (`lib/supabase/em-lotes.test.ts`); este aqui vigia
 * a FIAÇÃO: que a rota continua passando por ele.
 *
 * Teste por leitura de fonte, no mesmo estilo do teste-irmão
 * (`funil-mostra-dados-do-cliente.test.tsx`, describe "a fiação — quem usa a
 * regra a chama"): a rota não exporta essas funções internas, e simular a
 * cadeia inteira do supabase-js só para provar "isto passa por buscaEmLotes"
 * seria mais frágil que ler o texto — acoplaria o teste à forma exata da
 * cadeia encadeada em vez do que importa, que é: existe UM caminho pra
 * consultas que escalam com o funil, e é o do helper.
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

/** Chamada ao helper do upstream — com ou sem generics antes do `(`. */
const CHAMA_O_HELPER = /\bbuscaEmLotes(<[\s\S]*?>)?\(/g;

describe("consultas do quadro que escalam com o funil vão em lotes", () => {
  const rota = fonte(ROTA);

  it("a rota importa buscaEmLotes do helper compartilhado", () => {
    expect(rota).toMatch(
      /import\s*\{[^}]*\bbuscaEmLotes\b[^}]*\}\s*from\s*"@\/lib\/supabase\/em-lotes"/,
    );
  });

  it("⭐ withMarcadoresDoContato busca os contatos via buscaEmLotes, não .in() direto", () => {
    const corpo = corpoDaFuncao(rota, "withMarcadoresDoContato");
    expect(
      corpo,
      "contactIds está indo direto num .in() sem lote — estoura a URL do PostgREST em funis grandes (era exatamente isto no incidente do funil 'Disparo')",
    ).not.toMatch(/\.in\(\s*"id",\s*contactIds\s*\)/);
    expect(corpo, "a busca de contatos não passa pelo helper buscaEmLotes").toMatch(
      /\bbuscaEmLotes(<[\s\S]*?>)?\(\s*contactIds\s*,/,
    );
  });

  it("⭐ avisaAmbiguas busca os itens de inbox via buscaEmLotes, não .in() direto", () => {
    const corpo = corpoDaFuncao(rota, "avisaAmbiguas");
    expect(
      corpo,
      "a lista de contact_id das propostas ambíguas está indo direto num .in() sem lote",
    ).not.toMatch(/\.in\(\s*"ref_id",\s*ambiguas\.map/);
    expect(corpo, "avisaAmbiguas não passa pelo helper buscaEmLotes").toMatch(
      /\bbuscaEmLotes(<[\s\S]*?>)?\(\s*ambiguas\.map/,
    );
  });

  it("withScores, withConversas e withNextActions passam por buscaEmLotes (não regride)", () => {
    // Rede de segurança contra alguém "simplificar de volta" pra `.in()` direto
    // num refactor futuro sem perceber a regra.
    const esperado: Array<[string, number]> = [
      ["withScores", 1],
      ["withConversas", 1],
      ["withNextActions", 2],
    ];
    for (const [nome, chamadas] of esperado) {
      const corpo = corpoDaFuncao(rota, nome);
      expect(
        corpo.match(CHAMA_O_HELPER)?.length ?? 0,
        `${nome} deveria chamar buscaEmLotes ${chamadas}x`,
      ).toBe(chamadas);
      // Todo `.in()` destas funções filtra pelo `lote` do callback — nunca pela
      // lista inteira (`contactIds`, `leads.map(...)`, o que for).
      const filtrosIn = [...corpo.matchAll(/\.in\(\s*"[a-z_]+",\s*([^)]*?)\s*\)/g)].map((m) => m[1]);
      expect(filtrosIn.length, `${nome} não tem nenhum .in() — a consulta mudou de forma?`).toBeGreaterThan(0);
      expect(
        filtrosIn.filter((arg) => arg !== "lote"),
        `${nome} tem .in() direto numa lista de ids que escala com o funil`,
      ).toEqual([]);
    }
  });

  it("as 6 consultas que escalam com o funil usam o lote do helper", () => {
    // withScores, withConversas, withMarcadoresDoContato, avisaAmbiguas e as
    // duas de withNextActions: cada uma vira `.in("<coluna>", lote)` dentro do
    // callback de buscaEmLotes.
    const ocorrencias = rota.match(/\.in\(\s*"[a-z_]+",\s*lote\s*\)/g) ?? [];
    expect(
      ocorrencias.length,
      "esperava as 6 consultas do quadro filtrando pelo `lote` de buscaEmLotes",
    ).toBeGreaterThanOrEqual(6);
    expect(
      rota.match(CHAMA_O_HELPER)?.length ?? 0,
      "esperava 6 chamadas a buscaEmLotes na rota",
    ).toBeGreaterThanOrEqual(6);
  });
});
