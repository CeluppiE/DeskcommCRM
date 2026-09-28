/**
 * "Enviar vendas pelo canal da conversa" — a chave da venda pelo canal
 * intermediado (decisão do dono no doc 76, PR #1819).
 *
 * Mora em `organizations.settings.conversions.report_via_channel`, e não numa
 * coluna de `ad_platform_connections` como o telefone do Google: o caminho do
 * canal existe EXATAMENTE quando a organização não tem linha de conexão direta
 * com a Meta (`sem_conexao`). Guardar a chave nessa linha criaria a linha, e a
 * leitura da credencial passaria a responder `credencial_incompleta` — a chave
 * ligada desligaria o próprio caminho.
 *
 * ⚠️ AUSENTE É DESLIGADO, e isso é a decisão: o valor da venda e o telefone do
 * cliente só saem para o provedor quando a empresa pede. Toda organização que
 * existe hoje chega aqui sem a chave.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function vendaPeloCanalLigada(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const conversions = (settings as Record<string, unknown>).conversions;
  if (!conversions || typeof conversions !== "object") return false;
  return (conversions as Record<string, unknown>).report_via_channel === true;
}

/** Lê a chave da organização. LANÇA quando a leitura falha: quem chama espera e tenta de novo. */
export async function lerVendaPeloCanal(
  admin: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`leitura da chave falhou: ${error.message}`);
  return vendaPeloCanalLigada((data as { settings?: unknown } | null)?.settings);
}
