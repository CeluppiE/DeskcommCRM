import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * O texto do compromisso que chega ao cliente.
 *
 * Nasce do molde que já existia (`meetingDeliveryBody`) e mantém as duas coisas
 * que ele acertava e que costumam dar errado: formata no fuso do COMPROMISSO —
 * não no do servidor — e traduz para o idioma do CONTATO, não o de quem marcou.
 *
 * O que ele acrescenta é uma coisa só: aceitar **compromisso sem link**. Visita
 * e ligação não têm sala, e prometer uma porta que não existe é pior que não
 * dizer nada — então sem link o texto simplesmente não fala de link.
 *
 * ⚠️ Há UMA régua para este texto, e é esta função. `meetingDeliveryBody`
 * continua exportada (há teste em cima dela) mas passou a DELEGAR: duas réguas
 * para o mesmo texto divergem na primeira mudança, e foi o que já aconteceu com
 * a régua das regras de isolamento.
 *
 * Recorte do PR #803, de @paulolimajr77.
 */
export function textoDoCompromisso({
  startsAt,
  timeZone,
  url,
  idioma,
}: {
  startsAt: string;
  timeZone: string;
  /** `null` = compromisso sem reunião online (presencial, telefone). */
  url: string | null;
  idioma: Idioma;
}): string {
  const quando = new Intl.DateTimeFormat(tagDeIdioma(idioma), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(startsAt));

  const abertura = url
    ? traduzir("Sua reunião está marcada para", idioma)
    : traduzir("Seu compromisso está marcado para", idioma);
  const link = url ? ` ${traduzir("Link do Google Meet:", idioma)} ${url}` : "";
  return `${abertura} ${quando} (${timeZone}).${link}`;
}
