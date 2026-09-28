import type { SupabaseClient } from "@supabase/supabase-js";

import type { Actor } from "@/lib/api/handlers/types";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import type { Tarefa } from "@/lib/tarefas/tipos";

/**
 * O LAÇO DE RETORNO DA TAREFA (invariante 7 do Sistema Vivo).
 *
 * Uma tarefa é combinada POR CAUSA de um negócio — "ligar de volta na terça" só
 * existe porque alguém está negociando. Se ela vivesse só na tela de Tarefas,
 * quem abre o card do lead veria a conversa parar sem saber que há um retorno
 * marcado, e a pergunta "por que ninguém falou com este cliente?" ficaria sem
 * resposta visível. É o mesmo argumento de `consent_declined` no vocabulário da
 * timeline: o combinado é sinal, não ausência de sinal.
 *
 * ⚠️ Fire-and-forget de propósito, e o silêncio NÃO é o desfecho: a tarefa já
 * está gravada quando isto roda, então derrubar a resposta por causa da linha
 * da timeline trocaria uma perda pequena (a linha) por uma grande (o operador
 * achar que a tarefa não foi criada e criar de novo). O que a falha não pode é
 * sumir — por isso ela vai para o `console` do servidor via o logger padrão do
 * emissor, que devolve `{ ok, error }` em vez de lançar.
 *
 * O LAÇO também vale para a tarefa automática (#1540): `lib/tarefas/criar-tarefa.ts`
 * faz o MESMO INSERT — sem ele, o card do lead mostrava a conversa parar sem
 * nenhum sinal de que o sistema marcou um retorno.
 *
 * ═══ QUEM ASSINA A LINHA ═══
 *
 * É `Actor` e não um `actorUserId: string` porque a terceira porta desta
 * função — a tarefa criada pelo SISTEMA (cron de silêncio, nó `internal_task`)
 * — não tem pessoa a nomear, e aí a escolha é entre atribuir a linha a alguém
 * que não fez nada ou não escrever a linha. Nenhuma das duas. O ator vai
 * explícito em cada chamador: `user` nas rotas da tela, `webhook_source` na
 * tarefa automática, que `actorParaAtividade` traduz para `system`
 * (`lib/leads/activity-emitter.ts`, o mesmo padrão de `nascimento-do-lead.ts`).
 */
export async function registraAtividadeDaTarefa(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    tarefa: Pick<Tarefa, "id" | "title" | "due_date" | "priority" | "lead_id" | "contact_id">;
    tipo: "task_created" | "task_completed";
    actor: Actor;
  },
): Promise<{ ok: boolean; error?: string }> {
  // Sem negócio não há linha do tempo onde escrever: `crm_lead_activities.lead_id`
  // é `not null`. Tarefa solta ("revisar os textos do agente") é caso legítimo,
  // e ela vive na tela de Tarefas — não é perda.
  if (!args.tarefa.lead_id) return { ok: true };

  return emitLeadActivity(supabase, {
    organizationId: args.organizationId,
    leadId: args.tarefa.lead_id,
    contactId: args.tarefa.contact_id,
    type: args.tipo,
    sourceModule: "tarefas",
    sourceId: args.tarefa.id,
    actor: args.actor,
    // O título é texto que o operador escreveu SOBRE ESTE negócio — a mesma
    // classe do `reason` que a Agenda já grava. Cortado porque o campo aparece
    // numa linha da timeline, não num parágrafo.
    reason: args.tarefa.title.slice(0, 200),
    payload: {
      due_date: args.tarefa.due_date,
      priority: args.tarefa.priority,
    },
  });
}
