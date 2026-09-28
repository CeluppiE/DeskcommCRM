// lib/propostas/briefing-universal.ts
//
// O briefing que vale para QUALQUER produto — site, automação ou projeto
// especial sem modelo. São sete categorias, e a IA formula a pergunta do
// caso (em site, "o que o cliente tem" vira domínio/hospedagem/logo; em
// automação, acesso às contas e APIs). Resposta válida: um texto, ou a
// marca explícita "cliente não sabe" / "não se aplica" (para a conversa
// nunca travar).
//
// Puro, sem banco: quem lê/escreve é a ferramenta MCP (`crm_draft_proposal`
// recusa sem criar nada quando falta categoria ou confirmação).
import { z } from "zod";

export interface CategoriaDoBriefing {
  chave: string;
  rotulo: string;
  /** Como perguntar — com exemplo de mais de um tipo de produto, nunca de um nicho só. */
  orientacao: string;
}

export const CATEGORIAS_DO_BRIEFING: readonly CategoriaDoBriefing[] = [
  {
    chave: "objetivo",
    rotulo: "Objetivo",
    orientacao:
      "O que o cliente quer resolver com este projeto. Num site, para que servem as páginas; " +
      "numa automação, que trabalho manual deixa de existir; num projeto especial, qual problema acaba.",
  },
  {
    chave: "entregas",
    rotulo: "Entregas",
    orientacao:
      "O que será entregue no fim. Num site, as páginas e funcionalidades; numa automação, " +
      "os fluxos e integrações; num projeto especial, cada etapa combinada.",
  },
  {
    chave: "o_que_o_cliente_tem",
    rotulo: "O que o cliente já tem",
    orientacao:
      "O que já existe e os acessos necessários. Num site, domínio, hospedagem e logo; " +
      "numa automação, acesso às contas e APIs; num projeto especial, materiais e credenciais.",
  },
  {
    chave: "responsabilidades",
    rotulo: "Responsabilidades",
    orientacao:
      "O que fica com o cliente e o que fica com a empresa. Quem escreve os textos, " +
      "quem fornece fotos e materiais, quem testa e aprova cada parte — vale para site, " +
      "automação e projeto especial do mesmo jeito.",
  },
  {
    chave: "prazo",
    rotulo: "Prazo",
    orientacao:
      "Quando o cliente precisa disto pronto, e se há data que não pode furar — " +
      "lançamento, evento, campanha. Vale para site, automação e projeto especial.",
  },
  {
    chave: "decisao_e_orcamento",
    rotulo: "Decisão e orçamento",
    orientacao:
      "Quem decide a contratação e quanto pretende investir. Vale faixa de valor, não " +
      "precisa de número exato — seja um site, uma automação ou um projeto especial.",
  },
  {
    chave: "referencia",
    rotulo: "Referência",
    orientacao:
      "Um exemplo do que o cliente gosta — um site, uma automação que ele usa, um projeto " +
      "parecido — ou o que ele não quer de jeito nenhum.",
  },
] as const;

export const CHAVES_DO_BRIEFING: readonly string[] = CATEGORIAS_DO_BRIEFING.map((c) => c.chave);

export function rotuloDaCategoria(chave: string): string {
  return CATEGORIAS_DO_BRIEFING.find((c) => c.chave === chave)?.rotulo ?? chave;
}

const respostaDeCategoria = z.union([
  z.string().min(1),
  z.literal("cliente_nao_sabe"),
  z.literal("nao_se_aplica"),
]);

/** `briefing.nucleo`: as 7 chaves, cada uma com texto ou marca explícita de ausência. */
export const nucleoDoBriefingSchema = z.object({
  objetivo: respostaDeCategoria,
  entregas: respostaDeCategoria,
  o_que_o_cliente_tem: respostaDeCategoria,
  responsabilidades: respostaDeCategoria,
  prazo: respostaDeCategoria,
  decisao_e_orcamento: respostaDeCategoria,
  referencia: respostaDeCategoria,
});

export type NucleoDoBriefing = z.infer<typeof nucleoDoBriefingSchema>;

/** `briefing.confirmacao`: a frase exata com que o cliente confirmou o resumo. */
export const confirmacaoDoBriefingSchema = z.object({
  frase_do_cliente: z.string().min(1),
});

function nucleoDe(briefing: unknown): Record<string, unknown> {
  if (!briefing || typeof briefing !== "object" || Array.isArray(briefing)) return {};
  const nucleo = (briefing as Record<string, unknown>).nucleo;
  if (!nucleo || typeof nucleo !== "object" || Array.isArray(nucleo)) return {};
  return nucleo as Record<string, unknown>;
}

/**
 * As chaves do núcleo ausentes ou vazias. "cliente_nao_sabe" e "nao_se_aplica"
 * contam como preenchidas — são a saída para a conversa nunca travar. Nunca
 * lança: briefing ausente ou malformado devolve as 7.
 */
export function categoriasFaltando(briefing: unknown): string[] {
  const nucleo = nucleoDe(briefing);
  return CHAVES_DO_BRIEFING.filter((chave) => {
    const valor = nucleo[chave];
    return typeof valor !== "string" || valor.trim().length === 0;
  });
}

/** Minúsculas, sem acento, espaços colapsados, sem ponta. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A frase confere quando é IGUAL a uma mensagem inteira recebida, ou quando
 * tem 12+ caracteres e está contida numa delas (tudo normalizado). Um "sim"
 * solto nunca casa dentro de "assim que puder" — trecho curto só vale inteiro.
 */
export function fraseConfere(frase: unknown, mensagensRecebidas: string[]): boolean {
  if (typeof frase !== "string") return false;
  const alvo = normalizar(frase);
  if (alvo.length === 0) return false;
  return mensagensRecebidas.some((mensagem) => {
    const texto = normalizar(mensagem);
    return texto === alvo || (alvo.length >= 12 && texto.includes(alvo));
  });
}
