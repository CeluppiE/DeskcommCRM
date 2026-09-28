"use client";

import { useT } from "@/hooks/i18n/useT";
import { useCases } from "@/hooks/ai/useCases";
import { cn } from "@/lib/utils";

/**
 * Quantos casos esperam uma PESSOA — o número ao lado de "Casos" no menu.
 *
 * Conta só `awaiting_human`: é o estado em que a IA parou de avançar naquele
 * assunto e está esperando a equipe ("Aguardando você" na tela). Caso
 * esperando o cliente não pede nada de quem opera, e contá-lo ensinaria a
 * ignorar o número. Reusa a MESMA consulta da tela de Casos (a chave do React
 * Query é a mesma), então abrir a tela e olhar o menu não dobram a leitura.
 */
export function ContadorDeCasos({ compacto }: { compacto: boolean }) {
  const t = useT();
  const { data } = useCases("open");
  const pendentes = (data?.cases ?? []).filter((c) => c.status === "awaiting_human").length;
  if (pendentes === 0) return null;
  const rotulo = pendentes === 1 ? t("1 caso esperando você") : `${pendentes} ${t("casos esperando você")}`;
  return (
    <span
      data-testid="contador-de-casos"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "rounded-full bg-red-600 text-[10px] font-semibold leading-none text-white tabular-nums",
        compacto ? "absolute top-1 right-1 h-2 w-2" : "ml-auto px-1.5 py-0.5",
      )}
    >
      {compacto ? null : pendentes}
    </span>
  );
}
