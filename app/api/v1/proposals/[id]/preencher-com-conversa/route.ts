import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { env } from "@/lib/env";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { normalizarChaveDeOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";
import { LlmBudgetExceededError, LlmProviderUnknownError, LlmModelNotEnabledError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { getSkillsPool } from "@/lib/ai/skills/db";
import { montarDocumentoDaProposta, type PropostaParaDocumento } from "@/lib/propostas/documento/documento-da-proposta";
import type { ContatoParaDocumento } from "@/lib/propostas/documento/montar-dados";
import { montarTranscricao, sugerirValoresDaConversa } from "@/lib/propostas/preencher-com-conversa";
import { orcamentoDeIaDisponivel } from "@/lib/propostas/orcamento-de-ia-disponivel";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const LIMITE_DE_MENSAGENS = 60;

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  const p = proposta as PropostaParaDocumento & { status: string; conversation_id: string | null; contact_id: string | null };
  if (p.status !== "rascunho") {
    return fail("proposal_context_stale", t("Só é possível preencher o documento de uma proposta em rascunho."), 409, { requestId });
  }

  const { data: contato } = p.contact_id
    ? await admin.from("contacts").select("name, display_name").eq("organization_id", authz.org.orgId).eq("id", p.contact_id).maybeSingle()
    : { data: null };

  const documento = await montarDocumentoDaProposta(admin, authz.org.orgId, p, contato as ContatoParaDocumento | null);
  const camposDeBriefing = (documento?.camposFaltando ?? []).filter((c) => c.onde === "briefing");

  // Nada para sugerir: nem consulta mensagens, nem chama a IA (economiza
  // orçamento e evita um round-trip inútil quando só falta prazo/pagamento).
  if (camposDeBriefing.length === 0 || !p.conversation_id) {
    return ok({ disponivel: true, motivo: null, sugestoes: [] }, { requestId });
  }

  const { data: mensagens } = await admin
    .from("messages")
    .select("direction, body")
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", p.conversation_id)
    .in("direction", ["inbound", "outbound"])
    .order("sent_at", { ascending: false })
    .limit(LIMITE_DE_MENSAGENS);
  const transcricao = montarTranscricao(((mensagens ?? []) as Array<{ direction: string; body: string | null }>).slice().reverse());

  try {
    const sugestoes = await sugerirValoresDaConversa({
      campos: camposDeBriefing.map((c) => ({ caminho: c.caminho, rotulo: c.rotulo })),
      transcricao,
      pool: getSkillsPool(),
      cfg: llmEdgeConfigFromEnv(env),
      tenantId: authz.org.orgId,
    });
    return ok({ disponivel: true, motivo: null, sugestoes }, { requestId });
  } catch (err) {
    if (
      err instanceof LlmBudgetExceededError ||
      err instanceof LlmProviderUnknownError ||
      err instanceof LlmModelNotEnabledError
    ) {
      return ok({ disponivel: false, motivo: err.message, sugestoes: [] }, { requestId });
    }
    throw err;
  }
}
