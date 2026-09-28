// lib/propostas/padroes-da-organizacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

const PADRAO_DIAS_DE_VALIDADE = 15;
const PADRAO_DIAS_DE_FOLLOWUP = 3;

export interface PadroesDaProposta {
  defaultValidDays: number;
  defaultConditions: string | null;
  followupDias: number;
  /** P4B — ausente = ligado; só `false` explícito desliga. */
  avisarNoWhatsApp: boolean;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `organizations.settings` → validade e condições padrão. Pura; nunca lança. */
export function resolverPadroesDaProposta(settings: unknown): PadroesDaProposta {
  const propostas = objeto(objeto(settings)?.proposals);
  const dias = propostas?.default_valid_days;
  const condicoes = propostas?.default_conditions;
  const followup = propostas?.followup_dias;
  return {
    defaultValidDays: typeof dias === "number" && dias > 0 ? dias : PADRAO_DIAS_DE_VALIDADE,
    defaultConditions: typeof condicoes === "string" ? condicoes : null,
    followupDias: typeof followup === "number" && followup > 0 ? followup : PADRAO_DIAS_DE_FOLLOWUP,
    avisarNoWhatsApp: propostas?.avisar_no_whatsapp !== false,
  };
}

/** Lê a linha da organização e aplica a regra pura. */
export async function buscarPadroesDaOrganizacao(
  db: SupabaseClient,
  organizationId: string,
): Promise<PadroesDaProposta> {
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).single();
  return resolverPadroesDaProposta((data as { settings?: unknown } | null)?.settings);
}
