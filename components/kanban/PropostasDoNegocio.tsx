// components/kanban/PropostasDoNegocio.tsx
"use client";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { usePropostasDoLead } from "@/hooks/kanban/usePropostasDoLead";
import { formatCents } from "@/lib/money";

const ROTULO_DE_STATUS: Record<string, string> = {
  rascunho: "Rascunho", enviando: "Enviando", enviada: "Enviada", aceita: "Aceita",
  recusada: "Recusada", vencida: "Vencida", cancelada: "Cancelada", substituida: "Substituída",
};

interface Props {
  leadId: string;
  pipelineId: string;
  /** N1 — o atalho "Nova proposta" é `manager`+; o dossiê já sabe o papel de quem está vendo. */
  podeCriar?: boolean;
}

/**
 * N1 — seção "Propostas" do dossiê, depois de "Dados do negócio".
 *
 * Erro de leitura (inclusive o 404 de capacidade desligada, `sePropostasDesligadas`):
 * a seção some em vez de quebrar o dossiê — a página dedicada de Propostas é
 * quem mostra erro, aqui é só um resumo agregado.
 */
export function PropostasDoNegocio({ leadId, podeCriar = false }: Props): React.ReactElement | null {
  const t = useT();
  const { data: propostas, isLoading, isError } = usePropostasDoLead(leadId);

  if (isError) return null;

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">{t("Propostas")}</h3>
      {isLoading && <p className="text-xs text-text-muted">{t("Carregando…")}</p>}
      {!isLoading && (propostas?.length ?? 0) === 0 && (
        <p className="text-xs text-text-muted">{t("Nenhuma proposta ainda")}</p>
      )}
      {!isLoading && propostas && propostas.length > 0 && (
        <ul className="space-y-1">
          {propostas.map((p) => (
            <li key={p.id}>
              <Link href={`/app/proposals/${p.id}`} className="flex items-center justify-between text-xs hover:underline">
                <span>
                  {p.numero ? `${String(p.numero).padStart(4, "0")}/${p.ano}` : t("Rascunho")}
                  {p.versao > 1 ? ` — v${p.versao}` : ""} · {t(ROTULO_DE_STATUS[p.status] ?? p.status)}
                </span>
                <span>{formatCents(p.total_cents, p.moeda)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {podeCriar && (
        <Link
          href={`/app/proposals/novo?lead_id=${leadId}`}
          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
        >
          {t("Nova proposta")}
        </Link>
      )}
    </div>
  );
}
