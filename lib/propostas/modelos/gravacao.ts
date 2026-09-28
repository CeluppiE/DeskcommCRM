// lib/propostas/modelos/gravacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const secaoSchema = z.object({
  id: z.string().max(60),
  title: z.string().max(200),
  body: z.string().max(20000),
  required: z.boolean(),
  conditional: z.boolean(),
});

/** Formato gravado em `proposal_templates.sections` (o que `resolverModelo` lê). */
export function secoesParaGravar(sections: Array<{ id: string; title: string; body: string; required: boolean; conditional: boolean }>) {
  return sections.map((s) => ({
    id: s.id,
    title: s.title.trim(),
    title_es: null,
    body: s.body,
    body_es: null,
    required: s.required,
    conditional: s.conditional,
  }));
}

/**
 * `max(version) + 1` do slug na organização — o índice único é
 * (organization_id, slug, version), e personalizar/desativar/personalizar
 * de novo não pode repetir número.
 */
export async function proximaVersao(db: SupabaseClient, orgId: string, slug: string): Promise<number> {
  const { data } = await db
    .from("proposal_templates")
    .select("version")
    .eq("organization_id", orgId)
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { version: number } | null)?.version ?? 0) + 1;
}
