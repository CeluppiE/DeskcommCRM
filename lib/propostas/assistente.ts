import { z } from "zod";
import type pg from "pg";
import { tool, type ModelMessage, runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import type { ProposalItemInput } from "./tipos";
import { definirCaminho } from "./briefing-caminho";

export const mudancaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("editar_item"),
    item_id: z.string(),
    campo: z.enum(["descricao", "quantidade", "preco_unitario_cents", "desconto_cents"]),
    de: z.union([z.string(), z.number()]),
    para: z.union([z.string(), z.number()]),
  }),
  z.object({
    tipo: z.literal("remover_item"),
    item_id: z.string(),
    descricao: z.string(),
  }),
  z.object({
    tipo: z.literal("editar_proposta"),
    campo: z.enum(["valid_until", "condicoes", "titulo"]),
    de: z.string().nullable(),
    para: z.string(),
  }),
  z.object({
    tipo: z.literal("editar_briefing"),
    campo: z.string().min(1),
    de: z.string().nullable(),
    para: z.string(),
  }),
]);
export type Mudanca = z.infer<typeof mudancaSchema>;

const respostaShape = {
  mudancas: z.array(mudancaSchema)
    .describe("As mudanças pedidas pela instrução — SÓ elas, nada que não foi pedido."),
  nao_entendido: z.string().nullable()
    .describe("Preenchido quando a instrução não descreve uma mudança nesta proposta."),
};

export interface EstadoDaProposta {
  titulo: string;
  condicoes: string | null;
  valid_until: string | null;
  itens: Array<ProposalItemInput & { id: string }>;
  briefing: Record<string, unknown>;
}

/**
 * Aplica uma lista de mudanças JÁ REVISADAS pela pessoa (vindas do POST
 * .../assistant, nunca geradas de novo aqui). Item referenciado que não
 * existe mais é IGNORADO — silencioso de propósito (rascunho pode ter mudado
 * entre gerar e aplicar; a revision otimista da Tarefa 10 cobre o resto).
 */
export function aplicarMudancas(estado: EstadoDaProposta, mudancas: readonly Mudanca[]): EstadoDaProposta {
  let novo: EstadoDaProposta = { ...estado, itens: estado.itens.map((it) => ({ ...it })) };

  for (const m of mudancas) {
    if (m.tipo === "editar_item") {
      const idx = novo.itens.findIndex((it) => it.id === m.item_id);
      if (idx === -1) continue;
      const item = novo.itens[idx]!;
      const valor = m.campo === "descricao" ? String(m.para) : Number(m.para);
      novo = { ...novo, itens: novo.itens.map((it, i) => (i === idx ? { ...item, [m.campo]: valor } : it)) };
    } else if (m.tipo === "remover_item") {
      novo = { ...novo, itens: novo.itens.filter((it) => it.id !== m.item_id) };
    } else if (m.tipo === "editar_proposta") {
      novo = { ...novo, [m.campo]: m.para };
    } else if (m.tipo === "editar_briefing") {
      novo = { ...novo, briefing: definirCaminho(novo.briefing, m.campo, m.para) };
    }
  }
  return novo;
}

function promptDoEstado(estado: EstadoDaProposta): string {
  const itens = estado.itens
    .map((it) => `- [${it.id}] ${it.descricao} — qtd ${it.quantidade} × ${it.preco_unitario_cents === null ? "a definir" : `R$ ${(it.preco_unitario_cents / 100).toFixed(2)}`}, desconto R$ ${(it.desconto_cents / 100).toFixed(2)}`)
    .join("\n");
  return [
    `Proposta atual:`,
    `Título: ${estado.titulo}`,
    `Validade: ${estado.valid_until ?? "não definida"}`,
    `Condições: ${estado.condicoes ?? "nenhuma"}`,
    `Briefing atual (jsonb): ${JSON.stringify(estado.briefing)}`,
    `Itens:`,
    itens,
  ].join("\n");
}

export async function gerarMudancas(input: {
  instrucao: string;
  estado: EstadoDaProposta;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<{ mudancas: Mudanca[]; nao_entendido: string | null }> {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `${promptDoEstado(input.estado)}\n\nInstrução do usuário: ${input.instrucao}\n\nChame a ferramenta propor_mudancas SEMPRE, mesmo se a instrução não descrever nenhuma mudança válida — nesse caso, mudancas: [] e explique em nao_entendido.`,
    },
  ];

  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_assistant",
    system:
      "Você ajusta uma proposta comercial a partir de uma instrução curta, usando a ferramenta " +
      "propor_mudancas. Devolva só as mudanças pedidas — nunca mexa em item ou campo que a " +
      "instrução não mencionou. Para informação de briefing (segmento, serviço, estágio, " +
      "identidade, público, objetivo do projeto), use tipo 'editar_briefing' com 'campo' em " +
      "caminho pontuado (ex.: project.name, project.objective, client.company_or_name, " +
      "scope.pages_list) — são os MESMOS nomes que o documento final usa, então o valor " +
      "aparece direto na proposta.",
    messages,
    tools: {
      propor_mudancas: tool({
        inputSchema: z.object(respostaShape),
        execute: async (args) => args,
      }),
    },
  });

  // Single-step (sem maxSteps — default do SDK é 1 step): result.toolCalls do
  // topo é seguro aqui, ao contrário do caso multi-step do turno do agente
  // (ver aviso em lib/agent-engine/agent/operator-turn.ts:154).
  const chamada = result.toolCalls?.find((c) => c.toolName === "propor_mudancas");
  if (!chamada) {
    return { mudancas: [], nao_entendido: "O assistente não conseguiu interpretar esta instrução." };
  }
  const parsed = z.object(respostaShape).safeParse(chamada.input);
  if (!parsed.success) {
    return { mudancas: [], nao_entendido: "O assistente devolveu um formato inesperado." };
  }
  return parsed.data;
}
