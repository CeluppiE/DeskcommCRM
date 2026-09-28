import type { SupabaseClient } from "@supabase/supabase-js";

import { MODELOS_BASE } from "./catalogo-base";
import type { ModeloBase, SecaoDoModelo } from "./tipos";

export type ModeloResolvido = ModeloBase & { origem: "organizacao" | "base" };

interface LinhaDeModelo {
  slug: string;
  version: number;
  sections: Array<{
    id: string;
    title: string;
    title_es: string | null;
    body: string;
    body_es: string | null;
    required: boolean;
    conditional: boolean;
  }>;
  section_order: string[];
}

function mapeiaSecoes(linhas: LinhaDeModelo["sections"]): SecaoDoModelo[] {
  return linhas.map((s) => ({
    id: s.id,
    title: s.title,
    titleEs: s.title_es,
    body: s.body,
    bodyEs: s.body_es,
    required: s.required,
    conditional: s.conditional,
  }));
}

/**
 * A cópia da organização SEMPRE vence quando existe (decisão #15 da spec de
 * modelos: cópia nunca auto-atualiza a partir da base). Sem cópia, cai no
 * catálogo do código. Sem os dois, `null` — quem chama decide o que mostrar;
 * este resolvedor não lança para "modelo não encontrado", que não é erro de
 * sistema.
 */
export async function resolverModelo(
  db: SupabaseClient,
  organizationId: string,
  slug: string,
): Promise<ModeloResolvido | null> {
  const { data } = await db
    .from("proposal_templates")
    .select("slug, version, sections, section_order")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (data) {
    const linha = data as LinhaDeModelo;
    return {
      slug: linha.slug,
      version: linha.version,
      sections: mapeiaSecoes(linha.sections),
      sectionOrder: linha.section_order,
      origem: "organizacao",
    };
  }

  // Achado Important da revisão final da M0: `MODELOS_BASE[slug]` sozinho
  // devolve propriedades HERDADAS de Object.prototype para slugs como
  // "constructor" ou "toString" — um objeto sem slug/version/sections,
  // travestido de modelo encontrado. `Object.hasOwn` restringe à própria
  // chave do catálogo.
  if (!Object.hasOwn(MODELOS_BASE, slug)) return null;
  // hasOwn acima já prova que a chave existe — o índice do TS não sabe disso.
  const base = MODELOS_BASE[slug]!;
  return { ...base, origem: "base" };
}
