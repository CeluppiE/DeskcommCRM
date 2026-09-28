import type { SupabaseClient } from "@supabase/supabase-js";

import { partesNoFuso } from "@/lib/agenda/fuso";
import { fusoUtilizavel } from "@/lib/tempo/fusos";

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/**
 * D8 — toda data de proposta (ano da numeração, "hoje" do vencimento,
 * validade padrão) passa por aqui, nunca por `new Date().toISOString()`
 * direto (isso lê UTC, não o fuso da organização — auditoria de produção,
 * spec D8: 3 organizações reais, 2 fusos diferentes).
 */
export function dataIsoNoFuso(instante: Date, fuso: string): string {
  const fusoEmVigor = fusoUtilizavel(fuso);
  const p = partesNoFuso(instante, fusoEmVigor);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}

export function anoNoFuso(instante: Date, fuso: string): number {
  return partesNoFuso(instante, fusoUtilizavel(fuso)).ano;
}

export function somarDiasNoFuso(instante: Date, dias: number, fuso: string): string {
  const futuro = new Date(instante.getTime() + dias * 24 * 60 * 60 * 1000);
  return dataIsoNoFuso(futuro, fuso);
}

/** `organizations.timezone` não tem CHECK — nunca lança, degrada para o padrão. */
export async function fusoDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<string> {
  const { data } = await db.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return fusoUtilizavel((data as { timezone?: string | null } | null)?.timezone);
}
