// lib/propostas/prontidao-da-proposta.ts
import { calcularProntidao, type Prontidao } from "./prontidao";

export interface PropostaParaProntidao {
  contact_id: string | null;
  titulo: string | null;
  pricing_status: "missing" | "catalog" | "manual" | "custom" | "approved";
  prazo_dias_uteis: number | null;
  pagamento: string | null;
  valid_until: string | null;
  /** Pode vir `null` (proposta anterior a este plano) ou `{}` (briefing vazio). */
  briefing_json: unknown;
}

function temEscopo(briefingJson: unknown): boolean {
  if (briefingJson === null || typeof briefingJson !== "object" || Array.isArray(briefingJson)) return false;
  const escopo = (briefingJson as Record<string, unknown>).escopo;
  return typeof escopo === "string" && escopo.trim().length > 0;
}

/**
 * Monta `EntradaDeProntidao` a partir de uma linha de `crm_proposals` (mais
 * o booleano, já resolvido por quem chama, de "todo item tem preço"). É a
 * peça que faltava depois da Onda M0 (ver comentário em `prontidao.ts`).
 */
export function montarEntradaDeProntidao(proposta: PropostaParaProntidao, temItensComPreco: boolean): Prontidao {
  return calcularProntidao({
    temContato: proposta.contact_id !== null,
    temEscopo: temEscopo(proposta.briefing_json),
    temPrazo: proposta.prazo_dias_uteis !== null && proposta.prazo_dias_uteis > 0,
    temPrecoDefinido: proposta.pricing_status !== "missing",
    temPagamento: proposta.pagamento !== null && proposta.pagamento.trim().length > 0,
    temValidade: proposta.valid_until !== null,
    temConteudoCompleto: temItensComPreco,
  });
}
