"use client";

import { useEffect, useState } from "react";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import type { Mudanca } from "@/lib/propostas/assistente";

interface AssistantResponse {
  disponivel: boolean;
  motivo: string | null;
  mudancas: Mudanca[];
  nao_entendido: string | null;
  revision: number;
}

interface ApplyResponse {
  id: string;
  revision: number;
  total_cents: number;
}

export function AssistantPanel({
  propostaId,
  revision,
  onAplicado,
}: {
  propostaId: string;
  revision: number;
  onAplicado: (r: { revision: number; total_cents: number }) => void;
}) {
  const t = useT();
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [preview, setPreview] = useState<{
    mudancas: Mudanca[];
    disponivel: boolean;
    motivo: string | null;
    nao_entendido: string | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // N5 — checagem AO ABRIR (o campo já nasce desabilitado quando não há
  // orçamento). `null` = ainda carregando ou a checagem falhou: nos dois
  // casos o campo segue habilitado (falha aberta — a trava real continua
  // sendo a do clique, `assistant/route.ts`).
  const [orcamento, setOrcamento] = useState<{ disponivel: boolean; motivo: string | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<ApiSuccess<{ disponivel: boolean; motivo: string | null }>>(
        `/api/v1/proposals/${propostaId}/assistant/disponibilidade`,
      )
      .then((res) => {
        if (vivo) setOrcamento(res.data);
      })
      .catch(() => {
        if (vivo) setOrcamento(null);
      });
    return () => {
      vivo = false;
    };
  }, [propostaId]);

  const semOrcamento = orcamento !== null && !orcamento.disponivel;

  async function gerar() {
    if (!instrucao.trim()) return;
    setGerando(true);
    setErro(null);
    setPreview(null);
    try {
      const res = await apiClient.post<ApiSuccess<AssistantResponse>>(
        `/api/v1/proposals/${propostaId}/assistant`,
        { instrucao },
      );
      setPreview({
        mudancas: res.data.mudancas,
        disponivel: res.data.disponivel,
        motivo: res.data.motivo,
        nao_entendido: res.data.nao_entendido,
      });
    } catch (e) {
      const errorMsg = t("Não consegui gerar as mudanças agora.");
      setErro(errorMsg);
      showApiError(e);
    } finally {
      setGerando(false);
    }
  }

  async function aplicar() {
    if (!preview) return;
    setAplicando(true);
    setErro(null);
    try {
      const res = await apiClient.post<ApiSuccess<ApplyResponse>>(
        `/api/v1/proposals/${propostaId}/assistant/apply`,
        {
          revision,
          mudancas: preview.mudancas,
        },
      );
      onAplicado({ revision: res.data.revision, total_cents: res.data.total_cents });
      setPreview(null);
      setInstrucao("");
    } catch (e) {
      const errorMsg = t("A proposta mudou desde que você gerou as sugestões — gere de novo.");
      setErro(errorMsg);
      showApiError(e);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="rounded-md border p-4 space-y-3">
      <h2 className="font-semibold">{t("Assistente")}</h2>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder={t('Ex.: "baixa 10% e tira a hospedagem"')}
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          disabled={gerando || semOrcamento}
        />
        <Button onClick={gerar} disabled={gerando || !instrucao.trim() || semOrcamento}>
          {t("Gerar")}
        </Button>
      </div>
      {semOrcamento && <p className="text-sm text-gray-500">{t(orcamento?.motivo ?? "")}</p>}
      {erro && <p className="text-red-600">{erro}</p>}
      {preview && !preview.disponivel && <p className="text-gray-500">{preview.motivo}</p>}
      {preview && preview.disponivel && preview.mudancas.length === 0 && (
        <p className="text-gray-500">
          {preview.nao_entendido ?? t("Não entendi o que mudar nesta proposta.")}
        </p>
      )}
      {preview && preview.mudancas.length > 0 && (
        <div className="space-y-2">
          <ul className="text-sm space-y-1">
            {preview.mudancas.map((m, i) => (
              <li key={i}>
                {m.tipo === "remover_item" && (
                  <span>
                    {t("item")} "{m.descricao}" → {t("REMOVIDO")}
                  </span>
                )}
                {m.tipo === "editar_item" && (
                  <span>
                    {m.campo}: {String(m.de)} → {String(m.para)}
                  </span>
                )}
                {m.tipo === "editar_proposta" && (
                  <span>
                    {m.campo}: {String(m.de ?? t("(sem valor)"))} → {String(m.para)}
                  </span>
                )}
                {m.tipo === "editar_briefing" && (
                  <span>
                    {m.campo}: {String(m.de ?? t("(sem valor)"))} → {String(m.para)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={aplicar} disabled={aplicando}>
              {aplicando ? t("Aplicando…") : t("Aplicar")}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={aplicando}>
              {t("Descartar")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
