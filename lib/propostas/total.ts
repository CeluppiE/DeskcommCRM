// lib/propostas/total.ts
import type { ProposalItemInput } from "./tipos";

/**
 * Total em centavos. Item sem preço (§5.2, "a definir") não entra na soma —
 * nem ele, nem o desconto dele. Cada item com preço trava em ZERO se o
 * desconto exceder o subtotal — nunca deixa um item negativo puxar o total
 * pra baixo do que os outros itens somam sozinhos.
 */
export function calcularTotal(itens: readonly ProposalItemInput[]): number {
  return itens.reduce((acc, it) => {
    if (it.preco_unitario_cents === null) return acc;
    const subtotal = Math.round(it.quantidade * it.preco_unitario_cents);
    const liquido = Math.max(0, subtotal - it.desconto_cents);
    return acc + liquido;
  }, 0);
}
