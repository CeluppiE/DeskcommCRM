// lib/propostas/briefing-caminho.ts
/**
 * Grava `valor` no caminho pontuado (`scope.content.client_provided_list`)
 * sem mutar o objeto de entrada. Chave computada em literal cria propriedade
 * PRÓPRIA — `__proto__` como segmento não troca o protótipo de nada.
 */
export function definirCaminho(obj: Record<string, unknown>, caminho: string, valor: string): Record<string, unknown> {
  const [primeira, ...resto] = caminho.split(".");
  if (resto.length === 0) {
    return { ...obj, [primeira!]: valor };
  }
  const atual = obj[primeira!];
  const sub = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>) : {};
  return { ...obj, [primeira!]: definirCaminho(sub, resto.join("."), valor) };
}
