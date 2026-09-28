// lib/propostas/modelos/importar.ts
import { tool, type ModelMessage } from "ai";
import type pg from "pg";
import { z } from "zod";

import type { LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { ROTULO_DA_VARIAVEL } from "../documento/rotulos-das-variaveis";
import type { SecaoDoModelo } from "./tipos";

const TEXTO_MAXIMO = 30_000;

const respostaShape = {
  nome: z.string().min(1).max(200),
  secoes: z
    .array(
      z.object({
        id: z.string().max(60),
        title: z.string().max(200),
        body: z.string().max(20000),
        required: z.boolean(),
        conditional: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
};

function idNormalizado(bruto: string, usados: Set<string>): string {
  const base =
    bruto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "s_$1")
      .slice(0, 36) || "secao";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}_${n}`;
  usados.add(id);
  return id;
}

function sistema(): string {
  const vocabulario = Object.entries(ROTULO_DA_VARIAVEL)
    .map(([caminho, rotulo]) => `{{${caminho}}} = ${rotulo}`)
    .join("; ");
  return (
    "Você transforma a proposta comercial que uma empresa já usa num MODELO reutilizável, " +
    "chamando a ferramenta propor_modelo. Divida o texto em seções na ordem em que aparecem, " +
    "mantendo a redação da empresa. Troque por variável {{caminho}} não só o dado de UM cliente " +
    "específico (nome de pessoa ou empresa, valores, datas, prazos, endereços, quantidades), mas " +
    "também tudo que MUDA DE UM PROJETO PARA OUTRO: a lista de páginas ({{scope.pages_list}}), as " +
    "funcionalidades ({{scope.features_list}}), as integrações ({{scope.integrations_list}}), os tipos " +
    "de item ou serviço atendidos, o que o cliente fornece ({{scope.content.client_provided_list}}) e " +
    "o que a empresa fornece ({{scope.content.provider_provided_list}}), o que está incluído " +
    "({{included.list}}), o que não está ({{excluded.list}}) e o objetivo do projeto " +
    "({{project.objective}}). Exemplos neutros: num site, a lista de páginas e as integrações variam; " +
    "numa automação, os gatilhos, as ações e os sistemas integrados variam; num sistema, os módulos, " +
    "os perfis de usuário e os fluxos variam. Use primeiro " +
    `este vocabulário: ${vocabulario}. ` +
    "Valor total → {{investment.total_formatted}}; prazo → {{schedule.estimated_days}}; validade → " +
    "{{commercial_terms.validity_days}}. Se precisar de uma variável fora do vocabulário, use " +
    "{{scope.nome_em_snake_case}}. Seções que nem todo cliente leva (módulos opcionais como blog, " +
    "área de membros, locação, integrações específicas): conditional=true e required=false. Mantenha " +
    "a redação da empresa em tudo que é fixo (apresentação, metodologia, garantia, condições). Nunca " +
    "invente conteúdo que não está no texto. O nome do modelo descreve o tipo " +
    "de proposta (ex.: 'Site institucional'), nunca o nome do cliente."
  );
}

export async function gerarModeloDoTexto(input: {
  texto: string;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<{ nome: string; sections: SecaoDoModelo[]; sectionOrder: string[] } | null> {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content:
        `Texto da proposta da empresa:\n\n${input.texto.slice(0, TEXTO_MAXIMO)}\n\n` +
        "Chame a ferramenta propor_modelo SEMPRE, com o modelo inteiro.",
    },
  ];
  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_template_import",
    system: sistema(),
    messages,
    tools: {
      propor_modelo: tool({ inputSchema: z.object(respostaShape), execute: async (args) => args }),
    },
  });

  const chamada = result.toolCalls?.find((c: { toolName: string }) => c.toolName === "propor_modelo");
  if (!chamada) return null;
  const parsed = z.object(respostaShape).safeParse((chamada as { input: unknown }).input);
  if (!parsed.success) return null;

  const usados = new Set<string>();
  const sections: SecaoDoModelo[] = parsed.data.secoes.map((s) => ({
    id: idNormalizado(s.id || s.title, usados),
    title: s.title.trim() || "Seção",
    titleEs: null,
    body: s.body,
    bodyEs: null,
    required: s.required,
    conditional: s.conditional,
  }));
  return { nome: parsed.data.nome.trim(), sections, sectionOrder: sections.map((s) => s.id) };
}
