export type ProposalStatus =
  | "rascunho" | "enviando" | "enviada" | "aceita" | "recusada" | "vencida" | "cancelada" | "substituida";

export interface ProposalItemInput {
  id?: string;
  product_id: string | null;
  descricao: string;
  quantidade: number;
  /** null = "a definir" (§5.2) — só permitido quando product_id também é null. */
  preco_unitario_cents: number | null;
  desconto_cents: number;
  position: number;
}

export interface ProposalRow {
  id: string;
  organization_id: string;
  // D10: sobrevive ao negócio apagado — o FK virou `on delete set null`.
  lead_id: string | null;
  contact_id: string | null;
  status: ProposalStatus;
  numero: number | null;
  ano: number | null;
  versao: number;
  substitui_id: string | null;
  revision: number;
  total_cents: number;
  // D3: o desfecho do envio.
  message_id: string | null;
  ultima_falha_envio: string | null;
  // D10: o nome impresso no PDF, para o documento continuar legível órfão.
  destinatario_nome: string | null;
}
