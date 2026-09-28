// lib/propostas/documento/variaveis.ts
const PADRAO_VARIAVEL = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export function extrairVariaveis(texto: string): string[] {
  const encontradas = new Set<string>();
  for (const m of texto.matchAll(PADRAO_VARIAVEL)) {
    // O padrão tem exatamente 1 grupo de captura — se `m` existe, `m[1]`
    // existe. O TS não sabe disso e tipa `m[1]` como `string | undefined`.
    encontradas.add(m[1]!);
  }
  return [...encontradas];
}

function resolverCaminho(dados: Record<string, unknown>, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => {
    if (atual === null || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, dados);
}

function ehValorAusente(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === "string") return valor.trim().length === 0;
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

function formatarValor(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}

/**
 * Substitui `{{caminho}}` pelo valor resolvido em `dados` (spec §7 item 1).
 * Valor ausente vira "[a definir]" e entra em `faltantes` (item 2); `0` e
 * outros valores falsy que não são "vazios" (string vazia/array vazio/
 * null/undefined) NÃO contam como ausentes.
 */
export function substituirVariaveis(
  texto: string,
  dados: Record<string, unknown>,
): { textoRenderizado: string; faltantes: string[] } {
  const faltantes: string[] = [];
  const textoRenderizado = texto.replace(PADRAO_VARIAVEL, (_match, caminho: string) => {
    const valor = resolverCaminho(dados, caminho);
    if (ehValorAusente(valor)) {
      faltantes.push(caminho);
      return "[a definir]";
    }
    return formatarValor(valor);
  });
  return { textoRenderizado, faltantes };
}
