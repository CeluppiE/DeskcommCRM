// hooks/kanban/usePropostasDoLead.ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface PropostaDoLead {
  id: string;
  titulo: string;
  status: string;
  total_cents: number;
  moeda: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  valid_until: string | null;
  created_at: string;
}

/**
 * N1 — lista COMPLETA das propostas de um negócio, para a seção "Propostas"
 * do dossiê. Mesma rota e mesma queryKey de `usePropostaEnviadaDoLead`
 * (D10) — o React Query compartilha o cache entre os dois hooks quando
 * ambos estão montados ao mesmo tempo (dossiê aberto + diálogo de excluir).
 */
export function usePropostasDoLead(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ["proposals", "por-lead", leadId],
    queryFn: async () => apiClient.get<{ data: PropostaDoLead[] }>(`/api/v1/proposals?lead_id=${leadId}`),
    enabled,
    select: (res) => res.data,
  });
}
