/**
 * O `global.fetch` dos clients de SERVIDOR (#1082 / PR #1786).
 *
 * ─── Por que ele existe ──────────────────────────────────────────────────────
 *
 * A URL-base que se passa a `createClient`/`createServerClient` é a ORIGEM de
 * tudo que o SDK monta a partir dela. `signInWithOAuth` devolve
 * `${url}/auth/v1/authorize?…` e o storage devolve
 * `${urlStorage}/object/sign/…` — sem nenhuma chamada de rede no primeiro caso.
 * Se a base for a `SUPABASE_SERVER_URL`, esses links saem no endereço interno
 * (`http://kong:8000`) e chegam justamente a quem não o alcança: mídia, avatar,
 * fotos de produto, PDF da LGPD e login com Google apontados para o Kong.
 *
 * A correção é manter a base na URL PÚBLICA e desviar só o TRANSPORTE: este
 * fetch recebe as requisições do SDK já montadas na origem pública e reescreve
 * o prefixo para o endereço interno. O link continua saindo público, e o
 * caminho deixa de sair da rede.
 *
 * O inverso não fecha: com a base interna não há como adivinhar qual resposta
 * vira link e qual é só tráfego.
 *
 * ─── O que ele NÃO faz ──────────────────────────────────────────────────────
 *
 * Não decide nada. Quem passa os dois valores é o client que o chama, e a
 * política de qual endereço vale (trim, recusa do que não é http(s), aviso) é
 * de `urlDoSupabaseNoServidor`, uma vez só. Aqui só há uma comparação de
 * prefixo — e prefixo que não bate passa adiante, intacto: requisição para
 * outro host não é nossa.
 *
 * `lib/supabase/browser.ts` não usa isto. O navegador continua inteiro na URL
 * pública.
 */

/** Tira a barra que o `.env` pode trazer: `https://x/` + `storage/…` viraria `//`. */
function semBarraFinal(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Cria o fetch que desvia as requisições do SDK para o endereço interno do
 * servidor.
 *
 * `urlInterna` chega JÁ RESOLVIDA (quem chama passa o resultado de
 * `urlDoSupabaseNoServidor`) e `urlPublica` é a mesma `NEXT_PUBLIC_*` que serve
 * de base ao client. Sem variável — ou com um valor que o resolvedor recusou —
 * os dois são iguais e o transporte é exatamente o de antes.
 *
 * A reescrita é LAZY de propósito: `globalThis.fetch` é lido na hora da
 * chamada, nunca na hora de criar o client. É o que permite ao teste trocar o
 * fetch global e observar o destino sem tocar no SDK.
 */
export function fetchDoServidor(urlInterna: string, urlPublica: string): typeof globalThis.fetch {
  const interna = semBarraFinal(urlInterna);
  const publica = semBarraFinal(urlPublica);

  if (!interna || interna === publica) {
    return (input, init) => globalThis.fetch(input, init);
  }

  const desviar = (alvo: string): string => {
    if (alvo === publica) return interna;
    if (alvo.startsWith(`${publica}/`)) return interna + alvo.slice(publica.length);
    return alvo;
  };

  return (input, init) => {
    if (typeof input === "string") {
      return globalThis.fetch(desviar(input), init);
    }

    if (input instanceof URL) {
      const destino = desviar(input.href);
      return globalThis.fetch(destino === input.href ? input : new URL(destino), init);
    }

    // O SDK do Supabase sempre passa string; o Request está aqui para o
    // `global.fetch` ser honesto, não para um caso de uso do produto.
    const destino = desviar(input.url);
    if (destino === input.url) return globalThis.fetch(input, init);
    return globalThis.fetch(new Request(destino, input as unknown as RequestInit), init);
  };
}
