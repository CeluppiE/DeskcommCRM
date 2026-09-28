"use client";

/**
 * O campo do ícone da aba (favicon) — subir, ver e remover. Só na instalação.
 *
 * Usa a MESMA rota do logo (`/api/v1/marca/logo`, `peca=icone`): gate, teto de
 * 512 KB, farejador de bytes (PNG ou JPG, SVG recusado) e a ordem sobe → grava →
 * apaga são os do logo, sem cópia. A diferença é só a coluna (`favicon_path`).
 *
 * Sem `ajustarLogo` antes de subir: aquele ajuste recorta margem e reduz LARGURA
 * pensando num logotipo horizontal. Um ícone é quadrado e pequeno; reduzi-lo pela
 * escada de larguras do logo não ajuda ninguém. O teto continua no servidor.
 *
 * A prévia usa o estado devolvido pela rota, não o `router.refresh()`, pelo mesmo
 * motivo medido em `CampoDeLogo.tsx`: o refresh pode ser abortado pela rajada de
 * prefetch da barra lateral, e a tela diria "atualizado" mostrando o anterior.
 * A identidade do objeto `iconeDaCamada` é o sinal de render NOVO do servidor —
 * passe um literal no JSX, nunca memoizado.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ICONE_DESENHADO } from "@/lib/branding/icone";
import { TAMANHO_MAXIMO_DO_LOGO } from "@/lib/branding/logo";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  /** O ícone gravado nesta instalação, já como URL pública. `url: null` = nenhum. */
  readonly iconeDaCamada: { readonly url: string | null };
}

const ERRO_EM_PORTUGUES: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo para trocar o ícone da aba.",
  forbidden_role: "Você não tem permissão para trocar o ícone da aba.",
  mfa_required: "Confirme o segundo fator nesta sessão e tente de novo.",
  rate_limited: "Muitas trocas seguidas. Tente de novo em alguns minutos.",
};

export function CampoDoIconeDaAba({ iconeDaCamada }: Props) {
  const t = useT();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [, startTransition] = useTransition();

  const [iconeGravado, setIconeGravado] = useState<string | null>(iconeDaCamada.url);
  const [ultimoDoServidor, setUltimoDoServidor] = useState(iconeDaCamada);
  if (iconeDaCamada !== ultimoDoServidor) {
    setUltimoDoServidor(iconeDaCamada);
    setIconeGravado(iconeDaCamada.url);
  }

  async function urlDaResposta(resposta: Response): Promise<string | null | undefined> {
    const corpo = (await resposta.json().catch(() => null)) as {
      data?: { logo_url?: string | null };
    } | null;
    return corpo?.data?.logo_url;
  }

  async function razaoDaFalha(resposta: Response): Promise<string> {
    const corpo = (await resposta.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const codigo = corpo?.error?.code ?? "";
    return t(
      ERRO_EM_PORTUGUES[codigo] ??
        corpo?.error?.message ??
        "Não consegui trocar o ícone da aba agora.",
    );
  }

  async function enviar(arquivo: File) {
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set("escopo", "instalacao");
      corpo.set("peca", "icone");
      corpo.set("file", arquivo);
      const resposta = await fetch("/api/v1/marca/logo", { method: "POST", body: corpo });
      if (!resposta.ok) {
        toast.error(await razaoDaFalha(resposta));
        return;
      }
      toast.success(t("Ícone da aba atualizado."));
      const gravado = await urlDaResposta(resposta);
      if (gravado !== undefined) setIconeGravado(gravado);
      startTransition(() => router.refresh());
    } finally {
      setEnviando(false);
      // Sem isto, escolher o MESMO arquivo de novo não dispara `change`.
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/v1/marca/logo?escopo=instalacao&peca=icone", {
        method: "DELETE",
      });
      if (!resposta.ok) {
        toast.error(await razaoDaFalha(resposta));
        return;
      }
      toast.success(t("Ícone da aba removido."));
      const gravado = await urlDaResposta(resposta);
      if (gravado !== undefined) setIconeGravado(gravado);
      startTransition(() => router.refresh());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2" data-campo-do-icone-da-aba="">
      <Label htmlFor="icone-da-aba">{t("Ícone do aplicativo e do navegador")}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div
          data-previa-do-icone={iconeGravado ? "arquivo" : "desenhado"}
          className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-surface"
        >
          {/* <img> e não next/image: a URL é do storage de quem hospeda, e o
            `next/image` exige allowlist de domínios fechada em BUILD. Sem
            arquivo, a prévia é o próprio ícone desenhado que a aba usa. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconeGravado ?? ICONE_DESENHADO}
            alt={t("Ícone da aba")}
            className="size-8 object-contain"
          />
        </div>
        <input
          ref={entrada}
          id="icone-da-aba"
          type="file"
          // Filtra o seletor; quem decide o tipo é o farejador de bytes da rota.
          accept="image/png,image/jpeg"
          disabled={enviando}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void enviar(arquivo);
          }}
          className="max-w-xs text-sm file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-border file:bg-surface-elevated file:px-3 file:py-1.5 file:text-sm"
        />
        {iconeGravado ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void remover()}
            disabled={enviando}
          >
            {t("Remover ícone")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-text-muted">
        {t("Imagem quadrada, de preferência 512×512 ou maior. PNG ou JPG, até")}{" "}
        {Math.round(TAMANHO_MAXIMO_DO_LOGO / 1024)}{" "}
        {t(
          "KB. Usada no navegador e no aplicativo instalado. Sem arquivo, mantém o desenho da marca.",
        )}
      </p>
    </div>
  );
}
