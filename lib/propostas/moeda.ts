// lib/propostas/moeda.ts
export function formatarMoeda(cents: number, iso: string): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: iso });
}
