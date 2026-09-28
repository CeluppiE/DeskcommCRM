// lib/propostas/documento/renderer.ts
import { extrairVariaveis, substituirVariaveis } from "./variaveis";
import type { ModeloBase, SecaoDoModelo } from "../modelos/tipos";

export interface SecaoRenderizada {
  id: string;
  title: string;
  body: string;
  faltantes: string[];
}

export interface DocumentoRenderizado {
  secoes: SecaoRenderizada[];
  variaveisFaltando: string[];
}

/** Uma condicional só aparece sozinha (sem `required`) quando tem PELO MENOS
 * UM dado — spec §7 item 3. Descoberto varrendo o próprio `body`, já que o
 * modelo não declara variáveis por seção (ver Global Constraints do plano). */
function condicionalTemAlgumDado(secao: SecaoDoModelo, dados: Record<string, unknown>): boolean {
  const caminhos = extrairVariaveis(secao.body);
  if (caminhos.length === 0) return true; // seção condicional sem variável nenhuma: sempre aparece.
  return substituirVariaveis(secao.body, dados).faltantes.length < caminhos.length;
}

export function renderizarDocumento(modelo: ModeloBase, dados: Record<string, unknown>): DocumentoRenderizado {
  const porId = new Map(modelo.sections.map((s) => [s.id, s]));
  const secoes: SecaoRenderizada[] = [];
  const variaveisFaltando: string[] = [];

  for (const id of modelo.sectionOrder) {
    const secao = porId.get(id);
    if (!secao) continue; // sectionOrder citando id fantasma: pula, não lança.

    if (secao.conditional && !secao.required && !condicionalTemAlgumDado(secao, dados)) {
      continue; // omitida por inteiro, sem rastro.
    }

    const { textoRenderizado, faltantes } = substituirVariaveis(secao.body, dados);
    secoes.push({ id: secao.id, title: secao.title, body: textoRenderizado, faltantes });
    variaveisFaltando.push(...faltantes);
  }

  return { secoes, variaveisFaltando };
}
