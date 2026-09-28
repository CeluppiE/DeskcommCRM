import type { SupabaseClient } from "@supabase/supabase-js";

import { marcaDaOrganizacaoDeSettings } from "@/lib/branding/organizacao";
import { logoDaCamada } from "@/lib/branding/logo";

export interface MarcaDaOrganizacaoParaPdf {
  appName: string | null;
  accentHex: string | null;
  logoUrl: string | null;
}

/**
 * SÓ a organização — nunca a instalação/revendedor nem o `.env` do produto.
 * Mesma régua do PDF de LGPD (nunca nomeia o operador num documento do
 * controlador, `lib/lgpd/pdf-renderer.tsx`): `marcaDaSaida()`/
 * `resolverMarcaDaOrganizacao()` encadeiam a camada de instalação como
 * fallback por DESIGN (é o comportamento certo para convite/e-mail — "no
 * produto do revendedor quem atende é o cliente dele") e por isso NÃO podem
 * ser usadas aqui. Usa só as peças puras (`marcaDaOrganizacaoDeSettings`,
 * `logoDaCamada`), sem encadear camada nenhuma.
 */
export async function marcaDaOrganizacaoParaPdf(
  db: SupabaseClient,
  organizationId: string,
): Promise<MarcaDaOrganizacaoParaPdf> {
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const marca = marcaDaOrganizacaoDeSettings((data as { settings?: unknown } | null)?.settings);
  if (!marca) return { appName: null, accentHex: null, logoUrl: null };
  const hex = (marca.accent_hex ?? "").trim();
  return {
    appName: marca.app_name ?? null,
    accentHex: hex.length > 0 ? hex : null,
    logoUrl: logoDaCamada(marca.logo_path, null),
  };
}
