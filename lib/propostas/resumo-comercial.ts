// lib/propostas/resumo-comercial.ts
import { formatarMoeda } from "./moeda";

export interface ResumoComercialEntrada {
  tituloProjeto: string;
  totalCents: number;
  moeda: string;
  prazoDiasUteis: number | null;
  pagamento: string | null;
  /** ISO 8601 (YYYY-MM-DD) ou null. */
  validUntil: string | null;
  pricingStatus: "missing" | "catalog" | "manual" | "custom" | "approved";
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * O bloco que o cliente lê primeiro (spec de 21/09 §5.2/§6.1). Pura: quem
 * monta a entrada resolve preço/prazo/pagamento/validade antes de chamar.
 */
export function gerarResumoComercial(entrada: ResumoComercialEntrada): string {
  const investimento =
    entrada.pricingStatus === "missing" ? "A definir" : formatarMoeda(entrada.totalCents, entrada.moeda);
  const prazo =
    entrada.prazoDiasUteis !== null && entrada.prazoDiasUteis > 0
      ? `${entrada.prazoDiasUteis} dias úteis`
      : "a combinar";
  const pagamento = entrada.pagamento ?? "a combinar";
  const validade = entrada.validUntil ? formatarData(entrada.validUntil) : "a combinar";

  return [
    `Projeto: ${entrada.tituloProjeto}`,
    `Investimento: ${investimento}`,
    `Prazo: ${prazo}`,
    `Pagamento: ${pagamento}`,
    `Validade: ${validade}`,
  ].join("\n");
}
