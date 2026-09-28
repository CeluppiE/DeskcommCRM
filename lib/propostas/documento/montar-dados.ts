// lib/propostas/documento/montar-dados.ts
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { formatCents } from "@/lib/money";

export interface DadosDaPropostaParaDocumento {
  briefing_json: unknown;
  total_cents: number;
  moeda: string;
  prazo_dias_uteis: number | null;
  valid_until: string | null;
  created_at: string;
}

export interface ContatoParaDocumento {
  name: string | null;
  display_name: string | null;
}

function diasEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000);
}

/**
 * `{{approval.date}}` é a data em que o CLIENTE assina — ninguém a sabe no
 * envio. Sem valor ela virava pendência em todos os 8 modelos, e a trava de
 * envio recusava toda proposta com modelo (spec de 26/09, §1.5).
 */
export const LINHA_EM_BRANCO = "____/____/______";

/**
 * Monta o objeto de dados que `renderizarDocumento` (M2) consome — spec §7
 * item 1: "briefing_json + proposta + cliente", as três fontes juntas.
 * `investment`, `schedule`, `commercial_terms.validity_days` e `client.name`
 * SEMPRE vêm de coluna gravada (nunca do briefing) — são fato do negócio, não
 * algo que a IA deva inventar ou repetir por conta própria. `numero` continua
 * sempre `null`: o renderer reafirma a regra "número nunca aparece em
 * rascunho" (M2 Global Constraints).
 */
export function montarDadosDoDocumento(
  proposta: DadosDaPropostaParaDocumento,
  contato: ContatoParaDocumento | null,
): Record<string, unknown> {
  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};
  const briefingClient = (
    briefing.client && typeof briefing.client === "object" ? briefing.client : {}
  ) as Record<string, unknown>;
  const briefingCommercialTerms = (
    briefing.commercial_terms && typeof briefing.commercial_terms === "object"
      ? briefing.commercial_terms
      : {}
  ) as Record<string, unknown>;

  const nomeApresentavel = nomeDoContato(contato);
  const company = (briefingClient.company as string | undefined) ?? null;
  const nomeDoBriefing = (briefingClient.name as string | undefined) ?? null;

  return {
    ...briefing,
    numero: null,
    client: {
      ...briefingClient,
      name: nomeApresentavel ?? nomeDoBriefing ?? null,
      company,
      company_or_name: company ?? nomeApresentavel ?? nomeDoBriefing ?? null,
    },
    investment: { total_formatted: formatCents(proposta.total_cents, proposta.moeda) },
    schedule: { estimated_days: proposta.prazo_dias_uteis },
    commercial_terms: {
      ...briefingCommercialTerms,
      validity_days: proposta.valid_until ? diasEntre(proposta.created_at, proposta.valid_until) : null,
    },
    approval: { date: LINHA_EM_BRANCO },
  };
}
