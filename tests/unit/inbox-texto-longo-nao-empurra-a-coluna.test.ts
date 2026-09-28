/**
 * TEXTO LONGO SEM QUEBRA NÃO PODE EMPURRAR A COLUNA DO INBOX.
 *
 * O #1802 relata scroll horizontal (`Shift + Scroll`) no inbox. A primeira
 * leva do conserto (`f7b1ef4`, v1.46.0) protegeu a coluna DA CONVERSA e a
 * bolha; a segunda (`8e6220a`) trocou `break-words` por `wrap-anywhere`
 * porque o Tailwind 4.3.3 gera as duas regras com a mesma especificidade e a
 * quebra forçada ficava sem efeito.
 *
 * Este teste prende as DUAS camadas que aquele par de commits deixou de fora.
 * O mecanismo é o mesmo nos dois casos, e é ele que explica por que a linha da
 * mensagem continuava larga mesmo com `min-w-0`:
 *
 *   1. **CSS**: `overflow-wrap: break-word` quebra a linha na PINTURA mas NÃO
 *      reduz o min-content do elemento; `anywhere` reduz. Num contexto de
 *      grid/flex o min-content é o que define o tamanho mínimo do item — é
 *      por isso que `whitespace-pre-wrap` sem `wrap-anywhere` deixa um fato
 *      de "Memória do contato" com uma URL de 200 caracteres largar a coluna.
 *
 *   2. **GRID**: a coluna do CRM é uma trilha FIXA
 *      (`xl:grid-cols-[272px_1fr_296px]`, 320px no 2xl), e o `<aside>` do
 *      painel tem `overflow-y-auto`: o fato sem quebra abria rolagem
 *      horizontal DENTRO do painel, não na página. O `min-w-0` no wrapper da
 *      coluna é defesa uniforme com a coluna da conversa (`f7b1ef4`), não a
 *      causa do defeito.
 *
 * Régua 3 é a que captura o defeito reportado pelo autor do #1802: ele aponta
 * o container da MENSAGEM, que é o elemento mais largo visivelmente — mas o
 * que o deixa largo é o ancestral, e é o ancestral que este teste vigia.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PAINEL = "components/inbox/CRMSidePanel.tsx";
const LAYOUT = "components/inbox/InboxLayout.tsx";
const PASTA_INBOX = "components/inbox";

/** Toda quebra forçada aceita pelo projeto. `wrap-anywhere` é a preferida. */
const QUEBRA_FORCADA = /(?:\bwrap-anywhere\b|\bbreak-words\b|\bbreak-all\b)/;

function ler(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

function tsxDe(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...tsxDe(caminho));
    else if (/\.tsx$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Cada className de abertura de tag, para não casar classe em comentário. */
function classNames(): Array<{ arquivo: string; linha: number; classe: string }> {
  const saida: Array<{ arquivo: string; linha: number; classe: string }> = [];
  for (const arquivo of tsxDe(PASTA_INBOX)) {
    const texto = readFileSync(arquivo, "utf8");
    const re = /className=\{?\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      saida.push({
        arquivo: arquivo.replace(`${process.cwd()}/`, ""),
        linha: texto.slice(0, m.index).split("\n").length,
        classe: m[2]!,
      });
    }
  }
  return saida;
}

describe("inbox — texto longo não empurra a coluna (#1802)", () => {
  it("régua 1: todo whitespace-pre-wrap do inbox tem quebra forçada ao lado", () => {
    const semQuebra = classNames()
      .filter((c) => c.classe.includes("whitespace-pre-wrap"))
      .filter((c) => !QUEBRA_FORCADA.test(c.classe));

    // O defeito do #1802 era exatamente este: `whitespace-pre-wrap` sozinho
    // no fato da "Memória do contato" — URL não tinha onde quebrar a linha.
    expect(
      semQuebra,
      `classe(s) com whitespace-pre-wrap SEM quebra forçada:\n${semQuebra
        .map((c) => `  ${c.arquivo}:${c.linha}  ${c.classe}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("régua 2: o fato da Memória do contato quebra em qualquer ponto, e não volta break-words", () => {
    const fonte = ler(PAINEL);
    const linha = fonte.split("\n").find((l) => l.includes("f.headline"));
    expect(linha, `não achei o bloco de fatos em ${PAINEL}`).toBeDefined();

    const summary = linha!.match(/<summary[^>]*>/)?.[0] ?? "";
    expect(summary, `o <summary> do fato precisa de wrap-anywhere: ${summary}`).toContain(
      "wrap-anywhere",
    );

    const paragrafo = linha!.match(/<p[^>]*>/)?.[0] ?? "";
    expect(paragrafo, `o <p> do fato precisa de wrap-anywhere: ${paragrafo}`).toContain(
      "wrap-anywhere",
    );
    // Mesma armadilha do 8e6220a: as duas regras com a mesma especificidade e
    // o break-word vencendo a quebra forçada.
    expect(paragrafo).not.toContain("break-words");
  });

  it("régua 3: as colunas que podem vazar para a página têm min-w-0", () => {
    const fonte = ler(LAYOUT);

    // Coluna da conversa — protegida pelo f7b1ef4, é a que o #1802 aponta.
    expect(fonte).toMatch(/h-full min-h-0 min-w-0 flex-col md:flex/);

    // Coluna do CRM, trilha fixa do grid: min-w-0 como defesa uniforme com a
    // coluna da conversa (o transbordo do fato ficava dentro do painel).
    // O wrapper da coluna é o único <div> com `xl:block` no arquivo: é ele que
    // o grid conta como item da terceira track. (O outro render do painel é o
    // Sheet do celular, que não participa do grid.)
    const coluna = fonte.split("\n").find((l) => l.includes("xl:block"));
    expect(coluna, "não achei a coluna do CRM no layout").toBeDefined();
    expect(coluna, "a coluna do CRM (a última do grid) precisa de min-w-0").toContain("min-w-0");
    expect(coluna).toContain("hidden");
  });
});
