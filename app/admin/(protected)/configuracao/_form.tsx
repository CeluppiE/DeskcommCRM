"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  salvarConfiguracaoDaInstalacao,
  voltarConfiguracaoAoPadrao,
} from "@/app/actions/admin/salvarConfiguracaoDaInstalacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import type { MotivoDeDiagnostico } from "@/lib/instalacao/catalogo";

import type { LinhaDaTela } from "./page";

interface Grupo {
  grupo: string;
  titulo: string;
  resumo: string;
  linhas: LinhaDaTela[];
}

/**
 * De onde o valor em vigor veio. É a pergunta que o operador faz primeiro quando
 * algo não bate — "então de onde está saindo isso?" — e a tela responde sem que
 * ele precise abrir o servidor.
 */
function Origem({ fonte, idioma }: { fonte: "banco" | "ambiente" | "ausente"; idioma: Idioma }) {
  const t = (s: string) => traduzir(s, idioma);
  if (fonte === "ausente") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
        {t("Não configurado")}
      </span>
    );
  }
  if (fonte === "banco") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
        {t("Definido aqui nesta tela")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted">
      <span aria-hidden className="size-1.5 rounded-full bg-neutral-400" />
      {t("Vem do arquivo de instalação do servidor")}
    </span>
  );
}

const MOTIVO_CURTO: Record<MotivoDeDiagnostico, string> = {
  de_partida: "Necessária para o sistema ligar",
  chave_mestra: "É a chave que protege as outras",
  gravada_na_montagem: "Gravada quando o programa foi montado",
  pareada_com_conteiner: "Tem um par em outro programa do servidor",
  lida_no_boot_de_outro_processo: "Lida por outro programa ao ligar",
};

function CampoEditavel({ linha, idioma }: { linha: LinhaDaTela; idioma: Idioma }) {
  const t = (s: string) => traduzir(s, idioma);
  const [valor, setValor] = useState("");
  const [salvando, comecar] = useTransition();
  const { definicao } = linha;
  // O estado mostrado é LOCAL, inicializado pelo servidor e atualizado pelo
  // corpo da resposta de cada ação.
  //
  // ⚠️ E NÃO HÁ `router.refresh()` DENTRO DA TRANSIÇÃO — é isso que travava.
  // A primeira versão deste conserto aplicava `setEstado(r.estado)` e DEPOIS
  // chamava `router.refresh()` na mesma `startTransition`. O refresh é
  // atropelado pelos prefetches RSC da barra lateral e nunca completa; como
  // está DENTRO da transição, ela fica pendente para sempre — e o React retém o
  // `setEstado` junto até a transição inteira terminar. O retrato da falha no
  // CI mostrava o campo e o botão `[disabled]` (é o `isPending`), com o estado
  // velho na tela: a ação não falhou, ela nunca terminou. `revalidatePath` na
  // própria ação já cuida da coerência da próxima navegação; o refresh aqui não
  // acrescentava nada além da trava.
  const [estado, setEstado] = useState(linha.estado);

  function salvar() {
    comecar(async () => {
      const r = await salvarConfiguracaoDaInstalacao(definicao.chave, valor);
      if (r.ok) {
        setValor("");
        setEstado(r.estado);
        toast.success(t("Pronto, já está valendo."));
      } else {
        toast.error(r.erro);
      }
    });
  }

  function limpar() {
    comecar(async () => {
      const r = await voltarConfiguracaoAoPadrao(definicao.chave);
      if (r.ok) {
        setEstado(r.estado);
        toast.success(t("Voltou para o valor do arquivo de instalação."));
      } else {
        toast.error(r.erro);
      }
    });
  }

  const idCampo = `config-${definicao.chave}`;
  const idAjuda = `${idCampo}-ajuda`;

  return (
    <div className="space-y-2 border-t border-border/60 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={idCampo} className="text-sm font-medium">
          {t(definicao.rotulo)}
        </Label>
        <Origem fonte={estado.fonte} idioma={idioma} />
      </div>

      <p id={idAjuda} className="text-sm text-text-muted">
        {t(definicao.explicacao)}
      </p>

      {estado.configurado && (
        <p className="text-xs text-text-muted">
          {definicao.natureza === "segredo"
            ? `${t("Guardado, terminando em")} ••••${estado.last4 ?? ""}`
            : `${t("Agora:")} ${estado.valorVisivel}`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          id={idCampo}
          aria-describedby={idAjuda}
          type={definicao.natureza === "segredo" ? "password" : "text"}
          autoComplete="off"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={
            estado.configurado ? t("Escreva para substituir") : t("Escreva para configurar")
          }
          className="min-w-0 flex-1"
          disabled={salvando}
        />
        <Button onClick={salvar} disabled={salvando || valor.trim().length === 0}>
          {t("Salvar")}
        </Button>
        {estado.fonte === "banco" && (
          <Button variant="outline" onClick={limpar} disabled={salvando}>
            {t("Voltar ao padrão")}
          </Button>
        )}
      </div>
    </div>
  );
}

function CampoDeDiagnostico({ linha, idioma }: { linha: LinhaDaTela; idioma: Idioma }) {
  const t = (s: string) => traduzir(s, idioma);
  const [aberto, setAberto] = useState(false);
  const { definicao, estado } = linha;

  return (
    <div className="space-y-2 border-t border-border/60 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{t(definicao.rotulo)}</span>
        <Origem fonte={estado.fonte} idioma={idioma} />
      </div>
      <p className="text-sm text-text-muted">{t(definicao.explicacao)}</p>

      {estado.configurado && definicao.natureza === "segredo" && (
        <p className="text-xs text-text-muted">
          {t("Guardado, terminando em")} ••••{estado.last4 ?? ""}
        </p>
      )}

      {/*
        O porquê fica atrás de um clique, não escondido: quem só confere o estado
        não precisa ler; quem quer trocar precisa, e a resposta está aqui em vez
        de num fórum. Campo de texto seria pior que ausência — aceitaria e não
        faria nada.
      */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        // `py-1.5` não é estética: sem ele o alvo de toque fica abaixo de 24px de
        // altura e vira difícil de acertar no celular. Medido pela própria
        // bateria E2E (`getBoundingClientRect`), que reprovou 9 destes botões.
        // `inline-flex` porque um `<button>` inline não aplica padding vertical
        // na caixa — o padding sai, a ALTURA não muda, e a medição continua
        // reprovando com o CSS "corrigido".
        className="inline-flex items-center py-1.5 text-xs font-medium text-text-muted underline underline-offset-2 hover:text-foreground"
      >
        {definicao.motivo ? t(MOTIVO_CURTO[definicao.motivo]) : t("Não se troca por aqui")}
        {" · "}
        {aberto ? t("ocultar") : t("por quê?")}
      </button>

      {aberto && definicao.comoTrocar && (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-text-muted">
          {t(definicao.comoTrocar)}
        </p>
      )}
    </div>
  );
}

export function PainelDeConfiguracao({ grupos, idioma }: { grupos: Grupo[]; idioma: Idioma }) {
  const t = (s: string) => traduzir(s, idioma);
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <Card key={g.grupo} className="p-5">
          <div className="mb-1">
            <h2 className="text-base font-semibold">{t(g.titulo)}</h2>
            <p className="text-sm text-text-muted">{t(g.resumo)}</p>
          </div>
          <div className="mt-3">
            {g.linhas.map((linha) =>
              linha.definicao.controle === "edita" ? (
                <CampoEditavel key={linha.definicao.chave} linha={linha} idioma={idioma} />
              ) : (
                <CampoDeDiagnostico key={linha.definicao.chave} linha={linha} idioma={idioma} />
              ),
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
