"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

interface PropostaResumo {
  status: string;
  numero: number | null;
  ano: number | null;
}

/**
 * D10 — antes de excluir um negócio, a tela avisa quando há proposta já
 * enviada: o negócio some, mas o documento continua em Propostas (o FK virou
 * `on delete set null` na migration 0466, não mais cascade). `enabled` some
 * a chamada até o diálogo de exclusão abrir de verdade — não é gasto em toda
 * renderização do card.
 */
export function usePropostaEnviadaDoLead(leadId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["proposals", "por-lead", leadId],
    queryFn: async () => apiClient.get<{ data: PropostaResumo[] }>(`/api/v1/proposals?lead_id=${leadId}`),
    enabled,
    select: (res) => res.data.find((p) => p.status !== "rascunho" && p.status !== "cancelada" && p.numero) ?? null,
  });
}
