import type { SupabaseClient } from "@supabase/supabase-js";

import { anoNoFuso, fusoDaOrganizacao } from "./data-no-fuso";

/**
 * Aloca numero/ano chamando o contador atômico (`fn_proposta_aloca_numero`,
 * D9, migration 0401): a função nunca deriva de `max(numero)` sobre linhas
 * existentes, então apagar a proposta que usou o número anterior não o
 * libera (auditoria de produção, 19/09/2026: o mesmo número foi entregue a
 * dois clientes exatamente por essa derivação). Sem laço de repetição — o
 * UPSERT do contador é a única fonte de número, então não há mais colisão
 * possível na coluna `numero` (efeito colateral bom da spec, D9).
 *
 * Não grava `status` — quem chama decide o status (D3: entra em `enviando`
 * antes de chamar, e o desfecho final vem do status real da mensagem).
 *
 * D8: o "ano" é o do FUSO DA ORGANIZAÇÃO, não UTC — uma proposta enviada às
 * 22h30 de 31/12 em Brasília (01h30 UTC do dia seguinte) numera para o ano
 * que ACABOU na parede da organização, não para o ano seguinte. `agora` é
 * injetável para teste; em produção, quem chama omite e vale o relógio real.
 */
export async function alocarNumero(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string; agora?: Date },
): Promise<{ numero: number; ano: number }> {
  const agora = input.agora ?? new Date();
  const fuso = await fusoDaOrganizacao(admin, input.orgId);
  const ano = anoNoFuso(agora, fuso);

  const { data: numero, error: numeroErr } = await admin.rpc("fn_proposta_aloca_numero", {
    p_org: input.orgId,
    p_ano: ano,
  });
  if (numeroErr) throw numeroErr;

  const { data, error } = await admin
    .from("crm_proposals")
    .update({ numero, ano })
    .eq("id", input.propostaId)
    .eq("organization_id", input.orgId)
    .is("numero", null)
    .select("id, numero, ano")
    .single();
  if (error) throw error;

  return { numero: data.numero as number, ano: data.ano as number };
}
