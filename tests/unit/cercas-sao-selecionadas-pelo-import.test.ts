import { describe, expect, it } from "vitest";

import { ehCerca, selecionarCercas } from "../../vitest.cercas";

// `pnpm cercas` só antecipa o vermelho se a seleção pegar as guardas que de fato
// reprovaram PR no fim da suíte longa. As três abaixo são as medidas em
// 18/09/2026 (runs 35341823692 e 35331913136): se alguma sair da seleção — um
// import novo de `@/` num desses arquivos, por exemplo —, o `verify` volta a
// descobrir o erro aos 7–12 minutos em vez de ao primeiro minuto.
const REPROVARAM_NO_FIM_DA_SUITE = [
  "tests/unit/apendice-do-baseline-nao-diverge-da-cadeia.test.ts",
  "tests/unit/documentacao-aponta-para-o-que-existe.test.ts",
  "tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts",
];

describe("pnpm cercas — quem entra", () => {
  const selecionadas = selecionarCercas(process.cwd());

  it("as guardas que reprovaram no fim da suíte longa estão na seleção", () => {
    expect(REPROVARAM_NO_FIM_DA_SUITE.filter((f) => !selecionadas.includes(f))).toEqual([]);
  });

  it("nenhuma suíte de outro runner entra", () => {
    expect(
      selecionadas.filter((f) => /^tests\/(e2e|invariants|journeys)\//.test(f)),
    ).toEqual([]);
  });

  // Controle negativo: sem ele, um classificador que aceitasse tudo passaria
  // nos dois casos acima e rodaria a suíte inteira sem jsdom.
  it("arquivo que importa código do produto NÃO é cerca", () => {
    expect(ehCerca(`import { x } from "@/lib/x";\nimport { it } from "vitest";`)).toBe(false);
    expect(ehCerca(`import { y } from "./y";`)).toBe(false);
    expect(ehCerca(`const m = await import("@/lib/m");`)).toBe(false);
    expect(ehCerca(`import { render } from "@testing-library/react";`)).toBe(false);
  });

  it("arquivo que só lê o repositório é cerca", () => {
    expect(
      ehCerca(
        `import { readFileSync } from "node:fs";\nimport path from "node:path";\nimport { it } from "vitest";`,
      ),
    ).toBe(true);
  });
});
