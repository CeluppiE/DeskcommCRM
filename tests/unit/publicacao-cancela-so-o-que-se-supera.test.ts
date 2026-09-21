/**
 * O publish-image.yml cancela a rodada superada em pull_request E no push da
 * `main` (o `latest` superado é sobrescrito minutos depois), mas NUNCA a de uma
 * tag — é ela que publica a versão e promove `stable`. Aqui a expressão do
 * workflow é AVALIADA nos quatro eventos, não só lida.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const YML = readFileSync(".github/workflows/publish-image.yml", "utf-8");

// O `concurrency:` mora no job (ver o cabeçalho do ci.yml). Os três jobs de
// build usam a mesma condição — concorrencia-so-nos-jobs-pesados.test.ts cobra
// isso —, então basta avaliar a do build-and-push.
function campo(chave: "group" | "cancel-in-progress"): string {
  const inicio = YML.indexOf("\n  build-and-push:\n");
  const bloco = YML.slice(inicio, YML.indexOf("\n    steps:", inicio));
  const m = bloco.match(new RegExp(`^ {6}${chave}: (.+)$`, "m"));
  if (!m?.[1]) throw new Error(`build-and-push.concurrency.${chave} não encontrado`);
  return m[1];
}

type Contexto = { event_name: string; ref: string; workflow: string; pr?: number; matriz: string };

// Tradutor mínimo das expressões do Actions usadas aqui (==, !=, ||, &&,
// strings entre aspas simples). Qualquer outro token faz `new Function` falhar
// e o teste reprovar — melhor que avaliar errado em silêncio.
function avaliar(expr: string, c: Contexto): unknown {
  const js = expr
    .replace(/github\.event\.pull_request\.number/g, "c.pr")
    .replace(/github\.event_name/g, "c.event_name")
    .replace(/github\.workflow/g, "c.workflow")
    .replace(/github\.ref\b/g, "c.ref")
    .replace(/matrix\.name/g, "c.matriz")
    .replace(/==/g, "===")
    .replace(/!=/g, "!==");
  return new Function("c", `return (${js});`)(c);
}

// `texto-${{ a }}-${{ b }}` → cada `${{ }}` avaliado e concatenado.
function interpolar(modelo: string, c: Contexto): string {
  return modelo.replace(/\$\{\{ (.+?) \}\}/g, (_, e: string) => String(avaliar(e, c)));
}

const WORKFLOW = "Publicar imagem Docker (GHCR)";
const EVENTOS = {
  pr: { event_name: "pull_request", ref: "refs/pull/42/merge", workflow: WORKFLOW, pr: 42, matriz: "deskcommcrm" },
  main: { event_name: "push", ref: "refs/heads/main", workflow: WORKFLOW, matriz: "deskcommcrm" },
  tag: { event_name: "push", ref: "refs/tags/v1.35.0", workflow: WORKFLOW, matriz: "deskcommcrm" },
  dispatch: { event_name: "workflow_dispatch", ref: "refs/heads/main", workflow: WORKFLOW, matriz: "deskcommcrm" },
} satisfies Record<string, Contexto>;

describe("publish-image: cancela só o que se supera", () => {
  const cancela = campo("cancel-in-progress");
  const grupo = campo("group");

  it("cancela PR e push da main; nunca tag nem dispatch", () => {
    expect(interpolar(cancela, EVENTOS.pr)).toBe("true");
    expect(interpolar(cancela, EVENTOS.main)).toBe("true");
    expect(interpolar(cancela, EVENTOS.tag)).toBe("false");
    expect(interpolar(cancela, EVENTOS.dispatch)).toBe("false");
  });

  // Segunda trava, independente da primeira: mesmo que a condição mudasse, a
  // tag cai num grupo só dela e não há rodada da main para cancelá-la.
  it("tag fica fora do grupo da main — o grupo de uma tag é só dela", () => {
    const g = (c: Contexto) => interpolar(grupo, c);
    expect(g(EVENTOS.tag)).not.toBe(g(EVENTOS.main));
    expect(g(EVENTOS.tag)).toContain("refs/tags/v1.35.0");
    expect(g({ ...EVENTOS.tag, ref: "refs/tags/v1.36.0" })).not.toBe(g(EVENTOS.tag));
    // E a matriz entra no grupo: sem ela, o build do worker cancelaria o do app.
    expect(g({ ...EVENTOS.pr, matriz: "deskcomm-worker" })).not.toBe(g(EVENTOS.pr));
  });
});
