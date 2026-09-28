/**
 * O canal da conversa do contato sabe reportar a venda por conta própria?
 *
 * `lib/conversoes/` precisa decidir entre dois caminhos — o transporte direto
 * da plataforma (token + dataset do CRM) ou a ponte do canal intermediado — e
 * não pode perguntar QUAL provider atende a conversa: o lint de canal proíbe o
 * nome fora de `lib/channels/`. Esta função responde pela capacidade
 * (`adapter.reportConversion`), e a feature só vê "há um canal que reporta" ou
 * "não há".
 *
 * Qual conversa: a mais recente do contato cujo canal ainda está ativo e tem a
 * capacidade. Canal arquivado fica de fora — a conta do provedor pode nem ser
 * mais desta organização, e reportar por ela mandaria a venda para outro lugar.
 *
 * LANÇA quando a leitura falha: quem chama trata como transitório. Devolver
 * `null` aqui faria a venda cair no outro caminho por causa de uma instabilidade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "./archived";
import { getAdapter } from "./index";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef, type ChannelSessionRef } from "./session-ref";
import type { ChannelConversionInput, ChannelConversionResult } from "./types";

/** O que a feature entrega; escopo e endereço são resolvidos aqui. */
export type VendaParaOCanal = Omit<
  ChannelConversionInput,
  "organizationId" | "sessionRef" | "providerConversationId"
>;

export interface CanalQueReporta {
  reportar(venda: VendaParaOCanal): Promise<ChannelConversionResult>;
}

/** Quantas conversas do contato olhar, da mais recente para trás. */
const CONVERSAS_CONSIDERADAS = 5;

export async function canalQueReportaConversao(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string | null,
): Promise<CanalQueReporta | null> {
  if (!contactId) return null;

  const { data: conversas, error } = await admin
    .from("conversations")
    .select("channel_session_id, provider_conversation_id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(CONVERSAS_CONSIDERADAS);
  if (error) throw new Error(`conversas_ilegiveis: ${error.message}`);

  for (const c of (conversas ?? []) as {
    channel_session_id: string | null;
    provider_conversation_id: string | null;
  }[]) {
    if (!c.channel_session_id) continue;

    const base = () =>
      admin
        .from("channel_sessions")
        .select(CHANNEL_SESSION_REF_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", c.channel_session_id as string);
    const { data: sessao, error: erroDaSessao } = await queryTolerantToMissingArchived(
      () => base().is(ARCHIVED_AT, null).maybeSingle(),
      () => base().maybeSingle(),
    );
    if (erroDaSessao) throw new Error(`sessao_ilegivel: ${erroDaSessao.message}`);
    if (!sessao) continue;

    const ref = sessao as unknown as ChannelSessionRef;
    let adapter;
    try {
      adapter = getAdapter(ref.provider);
    } catch {
      continue;
    }
    const reportConversion = adapter.reportConversion;
    const sessionRef = resolveSessionRef(ref);
    if (!reportConversion || !sessionRef) continue;

    return {
      reportar: (venda) =>
        reportConversion({
          ...venda,
          organizationId,
          sessionRef,
          providerConversationId: c.provider_conversation_id,
        }),
    };
  }
  return null;
}
