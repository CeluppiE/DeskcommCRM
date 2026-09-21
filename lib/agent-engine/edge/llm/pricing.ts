/**
 * Tabela de preços versionada (stack.md §2: usage × pricing.ts → llm_calls.cost_cents).
 * ÚNICO lugar com preço de modelo no repo.
 *
 * Fonte: https://platform.claude.com/docs/en/about-claude/pricing (conferida 2026-09).
 * Cache: leitura = 0.1× a entrada; gravação = 1.25× no TTL de 5 minutos e 2× no de
 * 1 hora — os dois TTLs que o knob `LLM_CACHE_TTL` aceita (`lib/agent-engine/env.ts`),
 * e é por isso que `costCents` recebe o TTL em vigor em vez de supor a doutrina.
 *
 * Modelo fora da tabela → custo NULL (desconhecido): mais honesto que inventar 0 —
 * o budget soma coalesce(cost_cents, 0), então modelo sem preço não consome teto;
 * quem habilitar um modelo novo para uma org adiciona a linha de preço aqui.
 *
 * TRÊS armadilhas já pagas, e as três são do MESMO defeito — a tabela ficou na
 * geração 4 enquanto o catálogo (`ai_models`, migration 0101) andou:
 *
 *   1. A geração 5 (`claude-sonnet-5`, o padrão de atendimento, e `claude-opus-5`)
 *      não tinha linha. Custo NULL numa instalação real: a tela Uso e orçamento
 *      mostrava gasto zero e o teto mensal nunca disparava — medido numa VPS com
 *      28 chamadas reais, todas com `cost_cents` nulo.
 *   2. O antigo match por `startsWith` fazia `claude-opus-4` casar com
 *      `claude-opus-4-5` em diante e cobrar o preço do Opus 4/4.1 (aposentados,
 *      US$ 15/75) por um modelo que custa US$ 5/25 — 3× a mais, com o sinal
 *      invertido do defeito 1: aqui o teto disparava cedo demais.
 *   3. O mesmo `startsWith` daria preço a um id FUTURO que apenas começasse igual
 *      (`claude-sonnet-50`, `claude-opus-4-9`) — e custo errado não-nulo é pior
 *      que custo desconhecido, porque não acende o sinal de gasto incompleto.
 *
 * Por isso o match é EXATO, com uma única tolerância: o sufixo de data do vendor
 * (`claude-opus-4-1-20250805`). Id que a tabela não conhece volta NULL, que é o
 * contrato escrito acima.
 */

import type { CacheTtl } from './stable-prefix';

interface Preco {
  input: number;
  output: number;
  cacheRead: number;
  /** 1.25× a entrada — TTL de 5 minutos. */
  cacheWrite5m: number;
  /** 2× a entrada — TTL de 1 hora, a doutrina de caching (CLAUDE.md regra 15). */
  cacheWrite1h: number;
}

/** USD por MILHÃO de tokens, por id EXATO de modelo (o sufixo de data é tolerado). */
const USD_PER_MTOK: Record<string, Preco> = {
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  // Opus 4 e 4.1 são aposentados e custam 3× o Opus 4.5 — por isso id exato, e não
  // um prefixo `claude-opus-4` que engoliria toda a família.
  'claude-opus-4-1': { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * O preço de um id, tolerando o sufixo de data do vendor (`-20250805`).
 *
 * Exportada para o teste poder provar o que a tabela recusa — é o caso que o
 * `startsWith` antigo deixava passar silenciosamente.
 */
export function precoDoModelo(model: string): Preco | undefined {
  return USD_PER_MTOK[model] ?? USD_PER_MTOK[model.replace(/-\d{8}$/, '')];
}

/**
 * Custo em CENTS (fracionário; coluna numeric) ou null se o modelo não tem preço
 * conhecido. `inputTokens` aqui é o TOTAL do usage do SDK — a parcela cacheada é
 * descontada e cobrada pela tarifa de cache.
 *
 * `cacheTtl` é o TTL com que o prefixo estável foi gravado (knob `LLM_CACHE_TTL`);
 * o default repete a doutrina ('1h') para quem chama sem ele.
 */
export function costCents(model: string, usage: TokenUsage, cacheTtl: CacheTtl = '1h'): number | null {
  const p = precoDoModelo(model);
  if (p === undefined) {
    return null;
  }
  const cacheWrite = cacheTtl === '5m' ? p.cacheWrite5m : p.cacheWrite1h;
  const noCacheInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  const usd =
    (noCacheInput * p.input +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * cacheWrite +
      usage.outputTokens * p.output) /
    1_000_000;
  return usd * 100;
}
