import { z } from "zod";
import type pg from "pg";
import { tool, type ModelMessage, runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

export interface CampoParaSugestao {
  caminho: string;
  rotulo: string;
}

export interface SugestaoDeValor {
  campo: string;
  rotulo: string;
  valor: string;
}

/** `null` para mensagem sem corpo textual (mídia sem transcrição) — nunca vira linha vazia. */
export function linhaDaMensagem(direction: string, body: string | null): string | null {
  const texto = (body ?? "").trim();
  if (texto === "") return null;
  const quem = direction === "inbound" ? "Cliente" : "Atendente";
  return `${quem}: ${texto}`;
}

/**
 * Monta o texto da conversa na ordem em que as mensagens chegam (mais antiga
 * primeiro — quem chama já ordena assim, ver Task 4). Mensagem de mídia sem
 * texto derivado é pulada, nunca vira "Cliente: " vazio.
 */
export function montarTranscricao(mensagens: Array<{ direction: string; body: string | null }>): string {
  return mensagens
    .map((m) => linhaDaMensagem(m.direction, m.body))
    .filter((linha): linha is string => linha !== null)
    .join("\n");
}

const respostaShape = {
  sugestoes: z
    .array(z.object({ campo: z.string(), valor: z.string() }))
    .describe(
      "Só os campos da lista recebida que a conversa REALMENTE respondeu. Não invente valor " +
        "para o que não foi dito, e não sugira campo fora da lista.",
    ),
};

/**
 * Sugere valores para os campos que faltam no documento, lendo a conversa —
 * D5/D6 da spec de 26/09: a IA só sugere (nunca grava) e só o que está
 * vazio (a lista `campos` já vem filtrada pelo chamador para os que faltam).
 *
 * Sem campos ou sem transcrição, nem chama o modelo — não há o que sugerir e
 * a chamada custaria orçamento à toa.
 */
export async function sugerirValoresDaConversa(input: {
  campos: CampoParaSugestao[];
  transcricao: string;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<SugestaoDeValor[]> {
  if (input.campos.length === 0 || input.transcricao.trim() === "") return [];

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        "Campos que faltam preencher nesta proposta — responda SÓ os que a conversa abaixo respondeu de verdade:",
        ...input.campos.map((c) => `- ${c.caminho}: ${c.rotulo}`),
        "",
        "Conversa com o cliente:",
        input.transcricao,
      ].join("\n"),
    },
  ];

  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_fill_from_conversation",
    system:
      "Você lê uma conversa de atendimento e sugere valores só para os campos que a lista pede, " +
      "chamando a ferramenta sugerir_valores. Regras: (1) só sugira campo que está na lista recebida — " +
      "nunca invente um caminho novo; (2) só sugira valor que a conversa realmente disse — nunca deduza " +
      "ou complete por conta própria; (3) campo sem resposta clara na conversa fica de fora da lista, " +
      "nunca com valor vazio ou chutado.",
    messages,
    tools: {
      sugerir_valores: tool({ inputSchema: z.object(respostaShape), execute: async (args) => args }),
    },
  });

  const chamada = result.toolCalls?.find((c) => c.toolName === "sugerir_valores");
  if (!chamada) return [];
  const parsed = z.object(respostaShape).safeParse(chamada.input);
  if (!parsed.success) return [];

  const porCaminho = new Map(input.campos.map((c) => [c.caminho, c.rotulo]));
  return parsed.data.sugestoes
    .filter((s) => porCaminho.has(s.campo) && s.valor.trim() !== "")
    .map((s) => ({ campo: s.campo, rotulo: porCaminho.get(s.campo)!, valor: s.valor.trim() }));
}
