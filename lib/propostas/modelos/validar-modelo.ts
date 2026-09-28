// lib/propostas/modelos/validar-modelo.ts
import { extrairVariaveis } from "../documento/variaveis";
import type { SecaoDoModelo } from "./tipos";

export interface ModeloEditavel {
  nome: string;
  descricao: string | null;
  sections: SecaoDoModelo[];
  sectionOrder: string[];
}

export interface ErroDeModelo {
  campo: string;
  mensagem: string;
}

const ID_DE_SECAO = /^[a-z][a-z0-9_]{0,40}$/;
const SEGMENTOS_PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);
const MAXIMO_DE_SECOES = 40;

export function validarModelo(m: ModeloEditavel): ErroDeModelo[] {
  const erros: ErroDeModelo[] = [];
  const nome = m.nome.trim();
  if (nome.length < 2 || nome.length > 80) erros.push({ campo: "nome", mensagem: "O nome precisa ter de 2 a 80 caracteres." });
  if ((m.descricao ?? "").length > 300) erros.push({ campo: "descricao", mensagem: "A descrição passa de 300 caracteres." });
  if (m.sections.length === 0) erros.push({ campo: "sections", mensagem: "O modelo precisa de pelo menos uma seção." });
  if (m.sections.length > MAXIMO_DE_SECOES) erros.push({ campo: "sections", mensagem: `O modelo passa de ${MAXIMO_DE_SECOES} seções.` });

  const vistos = new Set<string>();
  m.sections.forEach((s, i) => {
    if (!ID_DE_SECAO.test(s.id)) {
      erros.push({ campo: `sections.${i}.id`, mensagem: "Identificador da seção: letras minúsculas, números e _ (começando por letra)." });
    } else if (vistos.has(s.id)) {
      erros.push({ campo: `sections.${i}.id`, mensagem: `Identificador de seção repetido: ${s.id}.` });
    }
    vistos.add(s.id);
    if (s.title.trim().length === 0 || s.title.length > 120) {
      erros.push({ campo: `sections.${i}.title`, mensagem: "O título da seção precisa ter de 1 a 120 caracteres." });
    }
    if (s.body.trim().length === 0 || s.body.length > 20000) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "O texto da seção precisa ter de 1 a 20.000 caracteres." });
      return;
    }
    const aberturas = (s.body.match(/\{\{/g) ?? []).length;
    const variaveis = extrairVariaveis(s.body);
    const completas = (s.body.match(/\{\{[a-zA-Z0-9_.]+\}\}/g) ?? []).length;
    if (aberturas !== completas) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "Há uma variável sem fechar, ou com caractere inválido, entre {{ e }}." });
    } else if (variaveis.some((v) => v.split(".").some((seg) => SEGMENTOS_PROIBIDOS.has(seg) || seg.length === 0))) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "Nome de variável não permitido." });
    }
  });

  const ordem = [...m.sectionOrder].sort().join("|");
  const ids = m.sections.map((s) => s.id).sort().join("|");
  if (ordem !== ids) erros.push({ campo: "sectionOrder", mensagem: "A ordem das seções não corresponde às seções do modelo." });

  return erros;
}

export function slugDaEmpresa(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 51);
  return `empresa_${base || "modelo"}`;
}
