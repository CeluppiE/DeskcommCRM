/**
 * De onde uma `crm_tasks` nasceu — vocabulário ABERTO (sem CHECK no banco,
 * CLAUDE.md doutrina de Migrations). `null`/ausente = criada à mão.
 */
export type TaskSourceKind = "promised_proposal" | "promised_followup";

export const TASK_SOURCE_LABELS: Record<TaskSourceKind, string> = {
  promised_proposal: "Promessa de proposta detectada pelo assistente",
  promised_followup: "Compromisso detectado pelo assistente",
};
