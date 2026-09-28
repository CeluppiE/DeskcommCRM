import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { env } from "@/lib/env";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { LlmBudgetExceededError, LlmProviderUnknownError, LlmModelNotEnabledError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { getSkillsPool } from "@/lib/ai/skills/db";
import { gerarMudancas, type EstadoDaProposta } from "@/lib/propostas/assistente";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ instrucao: z.string().trim().min(1).max(500) });
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data: proposta } = await supabase
    .from("crm_proposals")
    .select("titulo, condicoes, valid_until, briefing_json, status, revision")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });
  if (proposta.status !== "rascunho") {
    return fail("proposal_context_stale", t("Só é possível ajustar um rascunho."), 409, { requestId });
  }

  const { data: itens } = await supabase
    .from("crm_proposal_items")
    .select("id, product_id, descricao, quantidade, preco_unitario_cents, desconto_cents, position")
    .eq("organization_id", authz.org.orgId)
    .eq("proposal_id", id)
    .order("position");

  const briefing =
    proposta.briefing_json && typeof proposta.briefing_json === "object" && !Array.isArray(proposta.briefing_json)
      ? (proposta.briefing_json as Record<string, unknown>)
      : {};

  const estado: EstadoDaProposta = {
    titulo: proposta.titulo,
    condicoes: proposta.condicoes,
    valid_until: proposta.valid_until,
    briefing,
    itens: itens ?? [],
  };

  try {
    const resultado = await gerarMudancas({
      instrucao: parsed.data.instrucao,
      estado,
      pool: getSkillsPool(),
      cfg: llmEdgeConfigFromEnv(env),
      tenantId: authz.org.orgId,
    });
    return ok({ disponivel: true, motivo: null, ...resultado, revision: proposta.revision }, { requestId });
  } catch (err) {
    if (
      err instanceof LlmBudgetExceededError ||
      err instanceof LlmProviderUnknownError ||
      err instanceof LlmModelNotEnabledError
    ) {
      return ok(
        {
          disponivel: false,
          motivo: err.message,
          mudancas: [],
          nao_entendido: null,
          revision: proposta.revision,
        },
        { requestId },
      );
    }
    throw err;
  }
}
