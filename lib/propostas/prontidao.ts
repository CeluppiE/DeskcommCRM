/**
 * Prontidão da proposta (spec de modelos §7.8/§13) — cálculo PURO. Quem monta
 * `EntradaDeProntidao` a partir de `crm_proposals`/itens/briefing é trabalho
 * da Onda M1 (ainda não fiada aqui): esta função só decide o status a partir
 * de booleanos já resolvidos, para poder ser testada sem depender do
 * conteúdo real dos modelos-piloto, que não existe nesta onda.
 */
export interface EntradaDeProntidao {
  temContato: boolean;
  temEscopo: boolean;
  temPrazo: boolean;
  temPrecoDefinido: boolean;
  temPagamento: boolean;
  temValidade: boolean;
  temConteudoCompleto: boolean;
}

export type StatusDeProntidao = "incompleta" | "pronta_para_revisao" | "pronta_para_envio";

export interface ChecklistDeProntidao {
  cliente: boolean;
  escopo: boolean;
  prazo: boolean;
  investimento: boolean;
  pagamento: boolean;
  validade: boolean;
  conteudo: boolean;
}

export interface Prontidao {
  status: StatusDeProntidao;
  checklist: ChecklistDeProntidao;
}

export function calcularProntidao(entrada: EntradaDeProntidao): Prontidao {
  const checklist: ChecklistDeProntidao = {
    cliente: entrada.temContato,
    escopo: entrada.temEscopo,
    prazo: entrada.temPrazo,
    investimento: entrada.temPrecoDefinido,
    pagamento: entrada.temPagamento,
    validade: entrada.temValidade,
    conteudo: entrada.temConteudoCompleto,
  };

  const basico = checklist.cliente && checklist.escopo;
  const tudo = Object.values(checklist).every(Boolean);

  const status: StatusDeProntidao = !basico ? "incompleta" : tudo ? "pronta_para_envio" : "pronta_para_revisao";

  return { status, checklist };
}
