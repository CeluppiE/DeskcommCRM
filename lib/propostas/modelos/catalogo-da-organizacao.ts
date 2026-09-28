// lib/propostas/modelos/catalogo-da-organizacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";

export type OrigemDoModelo = "plataforma" | "personalizado" | "empresa";

export interface ModeloListado {
  slug: string;
  nome: string;
  origem: OrigemDoModelo;
  secoes: number;
  version: number;
  /**
   * Desligado pela empresa em `organizations.settings.proposals.modelos_ocultos`.
   * Some do seletor, da lista da IA e da sugestão — mas continua resolvendo
   * para propostas que já o usam (`resolverModelo` não muda).
   */
  oculto: boolean;
}

interface LinhaAtiva {
  slug: string;
  nome: string | null;
  version: number;
  sections: unknown;
}

/**
 * O que esta organização pode usar como modelo — uma leitura, um dono. O
 * seletor do editor, a tela de Modelos e a recusa de `crm_draft_proposal`
 * leem daqui (antes, os três usavam só os 8 do código).
 */
export async function listarModelosDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<ModeloListado[]> {
  const { data } = await db
    .from("proposal_templates")
    .select("slug, nome, version, sections")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const linhas = (data ?? []) as LinhaAtiva[];
  const porSlug = new Map(linhas.map((l) => [l.slug, l]));
  const contar = (s: unknown) => (Array.isArray(s) ? s.length : 0);

  const ocultos = await lerSlugsOcultos(db, organizationId);

  const daPlataforma: ModeloListado[] = Object.keys(ROTULO_DO_MODELO).map((slug) => {
    const copia = porSlug.get(slug);
    const base = MODELOS_BASE[slug]!;
    // Só modelo da plataforma/personalizado pode ser oculto — o da empresa se
    // remove pela tela, nunca se desliga por slug.
    const oculto = ocultos.has(slug);
    return copia
      ? { slug, nome: copia.nome?.trim() || ROTULO_DO_MODELO[slug]!, origem: "personalizado", secoes: contar(copia.sections), version: copia.version, oculto }
      : { slug, nome: ROTULO_DO_MODELO[slug]!, origem: "plataforma", secoes: base.sections.length, version: base.version, oculto };
  });

  const daEmpresa: ModeloListado[] = linhas
    .filter((l) => !Object.hasOwn(ROTULO_DO_MODELO, l.slug))
    .map((l) => ({ slug: l.slug, nome: l.nome?.trim() || l.slug, origem: "empresa" as const, secoes: contar(l.sections), version: l.version, oculto: false }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...daPlataforma, ...daEmpresa];
}

/**
 * A lista sem os desligados — o que o seletor mostra e o que a IA pode
 * sugerir. `resolverModelo` NÃO passa por aqui de propósito: proposta antiga
 * com modelo desligado continua abrindo.
 */
export async function listarModelosAtivos(db: SupabaseClient, organizationId: string): Promise<ModeloListado[]> {
  return (await listarModelosDaOrganizacao(db, organizationId)).filter((m) => !m.oculto);
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * `organizations.settings.proposals.modelos_ocultos` — lista de slugs. Valor
 * ausente ou malformado = lista vazia, nunca lança (roda na listagem e no
 * turno do agente; um throw ali derruba a tela ou o atendimento).
 */
async function lerSlugsOcultos(db: SupabaseClient, organizationId: string): Promise<Set<string>> {
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const propostas = objeto(objeto((data as { settings?: unknown } | null)?.settings)?.proposals);
  const lista = propostas?.modelos_ocultos;
  if (!Array.isArray(lista)) return new Set();
  return new Set(lista.filter((s): s is string => typeof s === "string"));
}
