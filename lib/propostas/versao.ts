import type { ProposalRow } from "./tipos";

export type DecisaoDeVersao = { tipo: "patch_no_mesmo" };

/**
 * Só rascunho é editável por aqui (PATCH e a checagem de status no envio).
 * `enviada` NÃO cria mais v2 neste caminho (C4/D4) — isso agora é
 * `decidirRevisao`, uma rota própria que para em rascunho em vez de
 * continuar para o envio no mesmo request.
 */
export function decidirVersao(atual: ProposalRow): DecisaoDeVersao {
  if (atual.status === "rascunho") return { tipo: "patch_no_mesmo" };
  throw new Error(`status_nao_editavel: ${atual.status}`);
}

export interface DecisaoDeRevisao {
  herdaNumero: number;
  herdaAno: number;
  novaVersao: number;
  substituiId: string;
}

/**
 * D4 — "Revisar" cria a v2 EM RASCUNHO, herdando numero/ano da v1. Só
 * `enviada` pode ser revisada: rascunho já é editável pela PATCH (revisar um
 * rascunho não cria nada novo, é confuso); os demais status (aceita,
 * recusada, vencida, cancelada, substituida, enviando) não têm "próxima
 * rodada" por este caminho.
 */
export function decidirRevisao(atual: ProposalRow): DecisaoDeRevisao {
  if (atual.status !== "enviada") {
    throw new Error(`nao_pode_revisar: ${atual.status}`);
  }
  if (atual.numero === null || atual.ano === null) {
    throw new Error("estado_inconsistente: proposta enviada sem numero/ano");
  }
  return {
    herdaNumero: atual.numero,
    herdaAno: atual.ano,
    novaVersao: atual.versao + 1,
    substituiId: atual.id,
  };
}
