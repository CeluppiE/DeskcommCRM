// lib/propostas/itens.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { calcularPricingStatus, type PricingStatus } from "./precificacao";
import { buscarPrecoDoCatalogo } from "./preco-do-catalogo";
import { calcularTotal } from "./total";
import type { ProposalItemInput } from "./tipos";

export interface ItemResolvido {
  product_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario_cents: number | null;
  desconto_cents: number;
  position: number;
}

export type ResolverItensResultado =
  | { ok: true; itens: ItemResolvido[]; totalCents: number; pricingStatus: Exclude<PricingStatus, "approved"> }
  | { ok: false; motivo: string };

/**
 * Ponto ÚNICO de resolução de preço de item de proposta — a rota de criação,
 * a rota de edição e a ferramenta MCP da IA chamam esta função e nenhuma
 * delas volta a calcular preço por conta própria (C3, D5 + §5.1/5.2).
 *
 * Preço de item com `product_id` vem SEMPRE do catálogo, nunca do `it`
 * recebido — mesmo que o chamador (IA ou payload adulterado) tenha mandado
 * um valor. `product_id` que não resolve na organização recusa o item
 * inteiro, para nunca aceitar produto de outra empresa nem inventar preço.
 */
export async function resolverItensDaProposta(
  db: SupabaseClient,
  organizationId: string,
  itens: readonly ProposalItemInput[],
  moedaDaProposta: string,
): Promise<ResolverItensResultado> {
  const resolvidos: ItemResolvido[] = [];
  for (const it of itens) {
    if (it.product_id) {
      const doCatalogo = await buscarPrecoDoCatalogo(db, organizationId, it.product_id);
      if (!doCatalogo) {
        return {
          ok: false,
          motivo: `Produto do item "${it.descricao}" não encontrado no catálogo desta organização.`,
        };
      }
      // D11 — nunca converte, recusa. Uma conversão silenciosa mudaria o
      // valor que a pessoa viu no catálogo sem ela perceber.
      if (doCatalogo.moeda !== moedaDaProposta) {
        return {
          ok: false,
          motivo: `Produto do item "${it.descricao}" está com moeda ${doCatalogo.moeda}, mas esta proposta é em ${moedaDaProposta}.`,
        };
      }
      resolvidos.push({
        product_id: it.product_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: doCatalogo.preco_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      });
    } else {
      resolvidos.push({
        product_id: null,
        descricao: it.descricao,
        quantidade: it.quantidade,
        preco_unitario_cents: it.preco_unitario_cents,
        desconto_cents: it.desconto_cents,
        position: it.position,
      });
    }
  }
  return {
    ok: true,
    itens: resolvidos,
    totalCents: calcularTotal(resolvidos),
    pricingStatus: calcularPricingStatus(resolvidos),
  };
}
