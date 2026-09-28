"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";

interface Config { enabled: boolean; default_valid_days: number; default_conditions: string | null; avisar_no_whatsapp?: boolean }

export function ProposalsSettingsClient() {
  const t = useT();
  const router = useRouter();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiClient.get<ApiSuccess<Config>>("/api/v1/settings/proposals").then((res) => setCfg(res.data));
  }, []);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    try {
      await apiClient.patch("/api/v1/settings/proposals", cfg);
      // O menu (sidebar, ⌘K) vem do layout de `/app`, que não re-renderiza numa
      // navegação comum: sem isto, ligar não mostra a porta e desligar deixa um
      // link que leva a 404 até o F5.
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  if (!cfg) return <div className="p-6">{t("Carregando…")}</div>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("Propostas")}</h1>
      <p className="text-sm">
        <Link href="/app/settings/tenant/proposals/modelos" className="underline underline-offset-4">
          {t("Modelos de proposta")}
        </Link>
      </p>
      <div className="flex items-center gap-2">
        <Switch id="proposals_enabled" checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
        <Label htmlFor="proposals_enabled">{t("Ligar propostas comerciais para esta organização")}</Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor="proposals_valid_days">{t("Validade padrão (dias)")}</Label>
        <Input
          id="proposals_valid_days"
          type="number"
          min={1}
          value={cfg.default_valid_days}
          onChange={(e) => setCfg({ ...cfg, default_valid_days: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="proposals_conditions">{t("Condições padrão")}</Label>
        <Textarea
          id="proposals_conditions"
          rows={4}
          value={cfg.default_conditions ?? ""}
          onChange={(e) => setCfg({ ...cfg, default_conditions: e.target.value || null })}
        />
      </div>
      <div className="flex items-start gap-2">
        <Switch
          id="proposals_avisar_whatsapp"
          checked={cfg.avisar_no_whatsapp !== false}
          onCheckedChange={(v) => setCfg({ ...cfg, avisar_no_whatsapp: v })}
        />
        <div className="space-y-1">
          <Label htmlFor="proposals_avisar_whatsapp">
            {t("Avisar no WhatsApp da equipe quando a IA rascunhar uma proposta")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("Usa o número configurado em Aviso no WhatsApp. Sem ele configurado e ligado, nada é enviado.")}
          </p>
        </div>
      </div>
      <Button onClick={salvar} disabled={salvando}>{salvando ? t("Salvando…") : t("Salvar")}</Button>
    </div>
  );
}
