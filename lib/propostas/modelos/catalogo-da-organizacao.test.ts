// lib/propostas/modelos/catalogo-da-organizacao.test.ts
import { describe, expect, it } from "vitest";

import { listarModelosAtivos, listarModelosDaOrganizacao } from "./catalogo-da-organizacao";

function db(linhas: Array<Record<string, unknown>>, settings: unknown = {}) {
  const cadeia: Record<string, unknown> = {};
  let tabela = "";
  cadeia.from = (nome: string) => {
    tabela = nome;
    return cadeia;
  };
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.maybeSingle = async () =>
    tabela === "organizations" ? { data: { settings }, error: null } : { data: null, error: null };
  cadeia.then = (resolve: (r: unknown) => unknown) =>
    Promise.resolve({ data: tabela === "organizations" ? [] : linhas, error: null }).then(resolve);
  return { from: cadeia.from } as never;
}

describe("listarModelosDaOrganizacao", () => {
  it("sem cópia nenhuma: os 8 da plataforma, com o rótulo do código", async () => {
    const lista = await listarModelosDaOrganizacao(db([]), "org-1");
    expect(lista).toHaveLength(8);
    expect(lista[0]).toMatchObject({ slug: "site_institucional", nome: "Site institucional", origem: "plataforma", oculto: false });
  });

  it("cópia de modelo da plataforma aparece como personalizado, no lugar dele", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "catalogo_imobiliario", nome: null, version: 3, sections: [{}, {}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(8);
    expect(lista.find((m) => m.slug === "catalogo_imobiliario")).toMatchObject({
      origem: "personalizado",
      nome: "Catálogo imobiliário",
      version: 3,
      secoes: 2,
      oculto: false,
    });
  });

  it("modelo da empresa entra depois dos da plataforma, com o nome dela", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "empresa_locacao", nome: "Locação por temporada", version: 1, sections: [{}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(9);
    expect(lista[8]).toEqual({ slug: "empresa_locacao", nome: "Locação por temporada", origem: "empresa", secoes: 1, version: 1, oculto: false });
  });

  it("slug em modelos_ocultos marca oculto no modelo da plataforma", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([], { proposals: { modelos_ocultos: ["site_institucional"] } }),
      "org-1",
    );
    expect(lista.find((m) => m.slug === "site_institucional")).toMatchObject({ oculto: true });
    expect(lista.find((m) => m.slug === "ecommerce")).toMatchObject({ oculto: false });
  });

  it("modelo personalizado também pode ser oculto; o da empresa, nunca", async () => {
    const lista = await listarModelosDaOrganizacao(
      db(
        [
          { slug: "ecommerce", nome: null, version: 2, sections: [] },
          { slug: "empresa_locacao", nome: "Locação", version: 1, sections: [] },
        ],
        { proposals: { modelos_ocultos: ["ecommerce", "empresa_locacao"] } },
      ),
      "org-1",
    );
    expect(lista.find((m) => m.slug === "ecommerce")).toMatchObject({ origem: "personalizado", oculto: true });
    expect(lista.find((m) => m.slug === "empresa_locacao")).toMatchObject({ origem: "empresa", oculto: false });
  });

  it("settings ausente ou malformado não lança e não oculta ninguém", async () => {
    for (const settings of [undefined, null, "texto", [], { proposals: null }, { proposals: { modelos_ocultos: "não é lista" } }, { proposals: { modelos_ocultos: [42, null] } }]) {
      const lista = await listarModelosDaOrganizacao(db([], settings), "org-1");
      expect(lista).toHaveLength(8);
      expect(lista.every((m) => m.oculto === false)).toBe(true);
    }
  });
});

describe("listarModelosAtivos", () => {
  it("devolve a lista sem os ocultos", async () => {
    const lista = await listarModelosAtivos(
      db([], { proposals: { modelos_ocultos: ["site_institucional", "automacao"] } }),
      "org-1",
    );
    expect(lista).toHaveLength(6);
    expect(lista.map((m) => m.slug)).not.toContain("site_institucional");
    expect(lista.map((m) => m.slug)).toContain("ecommerce");
  });
});
