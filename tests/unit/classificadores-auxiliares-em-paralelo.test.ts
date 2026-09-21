/**
 * OS DOIS CLASSIFICADORES AUXILIARES DO TURNO RODAM EM PARALELO.
 *
 * ## O que está preso aqui
 *
 * `classifyStage` (etapa do funil) e `classifyJailbreak` (anti-jailbreak) são
 * duas idas-e-voltas de LLM que o turno faz ANTES de responder ao cliente.
 * Nenhuma consome o resultado da outra. Em série, o cliente espera a SOMA das
 * duas; em `Promise.all`, só a mais lenta. A diferença é latência pura, paga em
 * todo turno de toda conversa — e ela volta sem ninguém perceber no dia em que
 * alguém, reorganizando o turno, trocar o `Promise.all` por dois `await`: o
 * comportamento visível continua certo, só mais lento.
 *
 * ## Por que por AST, e não executando o turno
 *
 * O call site mora em `executarTurnoDoAgente`, que não é exportada e precisa do
 * turno inteiro — o mesmo motivo registrado em `handoff-por-orcamento.test.ts`.
 * A propriedade é medida onde ela mora, com CONTROLE NEGATIVO obrigatório: um
 * detector quebrado deixaria este arquivo verde sem medir nada.
 *
 * A régua é estrutural e não textual: as duas chamadas precisam estar como
 * elementos do MESMO array passado a `Promise.all`. Contar `Promise.all(` no
 * texto, ou exigir que as duas apareçam "perto", aceitaria a regressão.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const INBOUND = join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts");
const CLASSIFICADORES = ["classifyStage", "classifyJailbreak"] as const;

/**
 * Para cada chamada a um classificador, devolve o `Promise.all` que a contém
 * como elemento de array (direto ou por um ternário), ou `null` se ela é
 * esperada sozinha.
 */
function paralelismoDosClassificadores(texto: string) {
  const ast = ts.createSourceFile("inbound.ts", texto, ts.ScriptTarget.Latest, true);
  const achados: Array<{ nome: string; promiseAll: ts.CallExpression | null }> = [];

  const ePromiseAll = (n: ts.Node): n is ts.CallExpression =>
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === "Promise" &&
    n.expression.name.text === "all";

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (CLASSIFICADORES as readonly string[]).includes(node.expression.text)
    ) {
      // Sobe atravessando SÓ o que mantém a chamada como valor do elemento:
      // parênteses e ternário. Qualquer outra coisa (um `await`, uma função)
      // significa que a chamada não é elemento direto do array.
      let atual: ts.Node = node;
      while (
        atual.parent &&
        (ts.isParenthesizedExpression(atual.parent) || ts.isConditionalExpression(atual.parent))
      ) {
        atual = atual.parent;
      }
      const array = atual.parent;
      const chamada = array && ts.isArrayLiteralExpression(array) ? array.parent : undefined;
      achados.push({
        nome: node.expression.text,
        promiseAll: chamada && ePromiseAll(chamada) ? chamada : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return achados;
}

describe("classificadores auxiliares do turno — em paralelo, nunca em série", () => {
  const fonte = readFileSync(INBOUND, "utf8");

  it("cada classificador é chamado exatamente uma vez no turno", () => {
    const achados = paralelismoDosClassificadores(fonte);
    expect(achados.map((a) => a.nome).sort()).toEqual([...CLASSIFICADORES].sort());
  });

  it("os dois são elementos do MESMO Promise.all", () => {
    const achados = paralelismoDosClassificadores(fonte);
    expect(achados.every((a) => a.promiseAll !== null)).toBe(true);
    expect(new Set(achados.map((a) => a.promiseAll)).size).toBe(1);
  });

  it("controle negativo: esperar um deles sozinho é acusado", () => {
    // Tira o `classifyJailbreak` do array e o espera depois, em série — a
    // regressão exata que este arquivo existe para pegar.
    const sabotado = `${fonte}\nasync function emSerie() { await classifyJailbreak(a, b, c, d, e); }`;
    const achados = paralelismoDosClassificadores(sabotado);
    expect(achados.filter((a) => a.promiseAll === null).map((a) => a.nome)).toEqual([
      "classifyJailbreak",
    ]);
  });

  it("controle negativo: dois Promise.all separados (um por classificador) são acusados", () => {
    const sabotado = fonte.replace(
      "const [stageResultado, jailbreakVerdict] = await Promise.all([",
      "const [stageResultado] = await Promise.all([",
    );
    expect(sabotado).not.toBe(fonte);
    const separado = `${sabotado}\nasync function outro() { await Promise.all([classifyStage(a, b, c, d, e)]); }`;
    const achados = paralelismoDosClassificadores(separado);
    expect(new Set(achados.map((a) => a.promiseAll)).size).toBeGreaterThan(1);
  });
});
