// app/api/v1/proposals/[id]/assistant/disponibilidade/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { normalizarChaveDeOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";
import { orcamentoDeIaDisponivel } from "@/lib/propostas/orcamento-de-ia-disponivel";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET .../assistant/disponibilidade — N5. Diz, ANTES do clique, se o
 * assistente tem orçamento de IA para responder (o campo nasce desabilitado
 * com o motivo quando não há).
 *
 * ADMIN CLIENT de propósito (não `createClient()` como o plano escrevia): a
 * `fn_gasto_de_ia_do_mes` só tem EXECUTE para service_role (revogado de
 * public/anon/authenticated no baseline) — com client de sessão o rpc
 * negaria, o helper degradaria para "disponível" e a N5 nunca desabilitaria
 * nada. O filtro explícito de `organization_id` cumpre a regra do admin
 * client; o gate de papel (agent+) é o mesmo da rota do assistente.
 */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_proposals" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposta } = await admin
    .from("crm_proposals")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!proposta) return fail("not_found", t("Proposta não encontrada."), 404, { requestId });

  const resultado = await orcamentoDeIaDisponivel(
    admin,
    authz.org.orgId,
    normalizarChaveDeOrcamento(env.AI_BUDGET_ENFORCEMENT),
  );
  return ok(resultado, { requestId });
}
