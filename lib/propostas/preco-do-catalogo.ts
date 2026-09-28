// lib/propostas/preco-do-catalogo.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PrecoDoCatalogo {
  preco_cents: number;
  moeda: string;
}

/**
 * Preço de item de proposta com `product_id` NUNCA vem do chamador — vem
 * daqui. `organization_id` e `ativo = true` no mesmo SELECT: produto de
 * outra organização ou já desativado não resolve, e o chamador (Task 3)
 * recusa o item inteiro em vez de aceitar sem preço (CLAUDE.md — nunca
 * inferir por join, sempre filtrar organization_id explícito).
 */
export async function buscarPrecoDoCatalogo(
  db: SupabaseClient,
  organizationId: string,
  productId: string,
): Promise<PrecoDoCatalogo | null> {
  const { data } = await db
    .from("catalog_products")
    .select("preco_cents, moeda")
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .eq("ativo", true)
    .maybeSingle();
  return data ? (data as PrecoDoCatalogo) : null;
}
