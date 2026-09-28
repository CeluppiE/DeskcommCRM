// lib/propostas/precificacao.ts

/**
 * missing: algum item sem preço — PDF mostra "a definir", envio recusado.
 * catalog: todo item veio do catálogo (preço resolvido no servidor).
 * manual: preço presente, mas ao menos um item foi digitado à mão.
 * approved: fora desta onda — nenhum código aqui escreve este valor (ver
 * Global Constraints do plano C3).
 */
export type PricingStatus = "missing" | "catalog" | "manual" | "approved";

interface ItemParaPrecificar {
  product_id: string | null;
  preco_unitario_cents: number | null;
}

export function calcularPricingStatus(
  itens: readonly ItemParaPrecificar[],
): Exclude<PricingStatus, "approved"> {
  if (itens.length === 0) return "missing";
  if (itens.some((it) => it.preco_unitario_cents === null)) return "missing";
  if (itens.every((it) => it.product_id !== null)) return "catalog";
  return "manual";
}
