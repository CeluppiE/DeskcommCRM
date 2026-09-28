"use client";

/**
 * "Enviar vendas pelo canal da conversa" — desligada por padrão (doc 76, PR #1819).
 * Salva no clique: é uma chave só, sem formulário em volta.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { definirVendaPeloCanal } from "@/app/actions/settings/definirVendaPeloCanal";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

const ERRO: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
};

export function VendaPeloCanal({ ligada, idioma }: { ligada: boolean; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [valor, setValor] = useState(ligada);
  const [isPending, startTransition] = useTransition();

  function mudar(novo: boolean) {
    setValor(novo);
    startTransition(async () => {
      const r = await definirVendaPeloCanal(novo);
      if (r.ok) {
        toast.success(t("Conexão salva."));
        router.refresh();
        return;
      }
      setValor(!novo);
      toast.error(t(ERRO[r.error] ?? "Não consegui salvar agora."));
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="report_via_channel">{t("Enviar vendas pelo canal da conversa")}</Label>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {t(
              "Sem conexão direta com a Meta, a venda de quem veio de anúncio pode ir pelo canal intermediado do WhatsApp, quando ele já liga o seu conjunto de dados da Meta ao número. Saem para o provedor do canal o valor, a moeda, o telefone do cliente e a conversa. Vem desligado: ligue só se a sua política de privacidade cobre esse uso.",
            )}
          </p>
        </div>
        <Switch
          id="report_via_channel"
          checked={valor}
          disabled={isPending}
          onCheckedChange={mudar}
        />
      </div>
    </Card>
  );
}
