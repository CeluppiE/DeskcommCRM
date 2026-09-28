// lib/propostas/orcamento-de-ia-disponivel.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decidirOrcamento,
  normalizarModoDeOrcamento,
  LIMIAR_PADRAO_PCT,
  type ChaveDeOrcamento,
} from "@/lib/agent-engine/edge/llm/orcamento";

export interface OrcamentoDeIaDisponivel {
  disponivel: boolean;
  motivo: string | null;
}

/**
 * N5 — checagem SÓ DE LEITURA do orçamento de IA (nunca abre aviso na
 * Central; isso só acontece no caminho real de chamada de modelo,
 * `aplicarOrcamento`, lib/agent-engine/edge/llm/run-model-call.ts). Reusa a
 * MESMA regra pura (`decidirOrcamento`) para nunca divergir do que vai
 * acontecer de verdade se a pessoa tentar usar o assistente.
 *
 * Fidelidade à decisão real (não só "teto vs gasto"): o bloqueio exige aviso
 * prévio no mês (condição 7 de `decidirOrcamento`) — por isso `avisadoNesteMes`
 * é consultado de verdade, com o MESMO predicado do gate (`SQL_ORCAMENTO`:
 * `budget_warning` criado no mês). Passar `false` fixo, como seria tentador,
 * tornaria o 'bloquear' inalcançável e a checagem sempre disponível.
 *
 * Falha aberta: erro de leitura nunca bloqueia a tela — degrada para
 * "disponível", igual a `aplicarOrcamento` (toda condição ambígua resolve
 * para não bloqueia).
 *
 * ⚠️ Quem chama passa client com EXECUTE na `fn_gasto_de_ia_do_mes` (só
 * service_role tem — revogado de public/anon/authenticated no baseline).
 * A rota usa `createAdminClient()` com filtro explícito de organization_id.
 */
export async function orcamentoDeIaDisponivel(
  db: SupabaseClient,
  organizationId: string,
  chave: ChaveDeOrcamento = "on",
  purpose = "proposal_assistant",
): Promise<OrcamentoDeIaDisponivel> {
  try {
    const { data: orcamento } = await db
      .from("ai_budgets")
      .select("monthly_limit_cents, enforcement_mode, enforcement_effective_at, alarm_threshold_pct")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!orcamento) return { disponivel: true, motivo: null };

    const modo = normalizarModoDeOrcamento(
      (orcamento as { enforcement_mode?: string | null }).enforcement_mode ?? null,
    );
    // 'off' resolve para 'seguir' sem precisar de mais nada — e poupa o rpc.
    if (modo === "off") return { disponivel: true, motivo: null };

    const { data: gasto } = await db.rpc("fn_gasto_de_ia_do_mes", { p_org: organizationId });

    const agora = new Date();
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
    const { data: avisos } = await db
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "budget_warning")
      .gte("created_at", inicioDoMes)
      .limit(1);

    const o = orcamento as {
      monthly_limit_cents?: number | string | null;
      enforcement_effective_at?: string | null;
      alarm_threshold_pct?: number | null;
    };
    const veredito = decidirOrcamento({
      modo,
      tetoCents: Number(o.monthly_limit_cents ?? 0),
      gastoCents: Number(gasto ?? 0),
      efetivoEm: o.enforcement_effective_at ? new Date(o.enforcement_effective_at) : null,
      agora,
      purpose,
      chave,
      limiarPct: o.alarm_threshold_pct ?? LIMIAR_PADRAO_PCT,
      avisadoNesteMes: (avisos?.length ?? 0) > 0,
    });

    if (veredito.acao === "bloquear") {
      return {
        disponivel: false,
        motivo:
          "O orçamento mensal de IA desta organização foi atingido. Ajuste o limite em Uso de IA › Orçamento, ou aguarde a virada do mês.",
      };
    }
    return { disponivel: true, motivo: null };
  } catch {
    return { disponivel: true, motivo: null };
  }
}
