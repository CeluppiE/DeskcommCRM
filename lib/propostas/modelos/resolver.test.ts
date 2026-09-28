import { describe, expect, it } from "vitest";
import { resolverModelo } from "./resolver";

function dbFalso(linha: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: linha, error: null }),
            }),
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("resolverModelo — cópia da organização vence; sem cópia, cai no código; sem os dois, null", () => {
  it("organização tem cópia ativa: devolve a cópia, origem 'organizacao'", async () => {
    const db = dbFalso({
      slug: "institucional",
      version: 3,
      sections: [{ id: "s1", title: "Resumo", title_es: null, body: "...", body_es: null, required: true, conditional: false }],
      section_order: ["s1"],
    });
    const modelo = await resolverModelo(db, "org-1", "institucional");
    expect(modelo).toMatchObject({ slug: "institucional", version: 3, origem: "organizacao" });
  });

  it("organização sem cópia e slug fora do MODELOS_BASE (vazio hoje): devolve null, não lança", async () => {
    const db = dbFalso(null);
    const modelo = await resolverModelo(db, "org-1", "institucional");
    expect(modelo).toBeNull();
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "slug '%s' (propriedade herdada de Object.prototype): devolve null, não um modelo fantasma (achado Important da revisão final da M0)",
    async (slugPerigoso) => {
      const db = dbFalso(null);
      const modelo = await resolverModelo(db, "org-1", slugPerigoso);
      expect(modelo).toBeNull();
    },
  );
});
