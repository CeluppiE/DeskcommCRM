/**
 * A URL que o PROCESSO DO SERVIDOR usa para falar com o Supabase (#1082).
 *
 * ─── O problema que ela resolve ──────────────────────────────────────────────
 *
 * Hoje uma instalação tem UM endereço de Supabase só, e ele é público por
 * necessidade: `NEXT_PUBLIC_SUPABASE_URL` é queimada no bundle e entregue ao
 * navegador por `<PublicEnvScript/>` (`app/public-env-script.tsx`). Numa
 * instalação com o Supabase **na mesma rede** — Kong/self-host, o caminho que o
 * `hostgator-setup-kit/healthcheck.sh` já reconhece como topologia válida — o
 * caminho curto (REST, Realtime, Storage) existe em `http://kong:8000` e não
 * precisa sair para a internet. Mas colocá-lo na `NEXT_PUBLIC_*` publicaria o
 * endpoint interno para qualquer pessoa que abrir as ferramentas do navegador.
 *
 * `SUPABASE_SERVER_URL` é a variável server-only que fecha essa bifurcação:
 * preenchida, o servidor fala com o endereço interno; vazia (o estado de toda
 * instalação existente), vale a pública — comportamento idêntico ao de antes.
 *
 * ─── Por que um MÓDULO PURO, e não uma função que lê `env` ───────────────────
 *
 * O mesmo resolvedor é usado por dois runtimes com contratos de ambiente
 * DIFERENTES: o app (`lib/env.ts`, validado no import) e o worker
 * (`lib/agent-engine/env.ts`, `loadEnv`). Se este arquivo importasse `@/lib/env`
 * para ler sozinho, o worker passaria a herdar a validação do app inteiro — que
 * cobra na importação variáveis que o worker não tem. Por isso a FUNÇÃO recebe
 * os dois valores: quem chama passa os do SEU runtime, e a POLÍTICA (precedência,
 * trim, recusa do que não é endereço, aviso) mora aqui, uma vez só.
 *
 * ─── O que ela NÃO faz ──────────────────────────────────────────────────────
 *
 * Não decide o que o NAVEGADOR fala. `lib/supabase/browser.ts` e
 * `app/public-env-script.tsx` continuam na `NEXT_PUBLIC_SUPABASE_URL`, e
 * `SUPABASE_SERVER_URL` não entra no payload público — vigiado por
 * `tests/unit/supabase-server-url-opcional.test.ts`. Se essa linha voltar, o
 * ganho da variável (não expor o endpoint interno) vira o defeito.
 */
import { logger } from "@/lib/logger";

/** Só HTTP(S) serve: o valor alimenta `fetch` do Node e do Edge, e um `file://`
 * ou um esquema inventado chegaria ao SDK como base de rotas do PostgREST. */
const E_HTTPS = /^https:\/\//i;
const E_HTTP = /^http:\/\//i;

/** O valor que a INSTALAÇÃO escreveu serve de chave do aviso único. */
const avisoDaUrlInvalida = new Set<string>();

/** Nomes das variáveis, nunca os valores: a URL pode vir com credencial na
 * authority (`http://user:senha@kong:8000`) e log de instalação é log público. */
function avisarUrlRecusada(chave: string, valor: string): void {
  if (avisoDaUrlInvalida.has(chave)) return;
  avisoDaUrlInvalida.add(chave);
  logger.warn(
    "url do Supabase do servidor recusada: o valor não é um endereço http(s) absoluto — " +
      "vale a URL pública, como antes. Escreva com esquema, começando por http:// ou https://",
    {
      variavel: chave,
      formato: E_HTTPS.test(valor) || E_HTTP.test(valor) ? "esquema-recusado" : "sem-esquema",
    },
  );
}

/**
 * A URL que o servidor usa: a server-only quando ela é utilizável, a pública
 * quando não há nada melhor.
 *
 * Ordem das decisões, e o motivo de cada uma:
 *
 * 1. **Vazio = ausente.** O `.env` de toda instalação gera `CHAVE=` e o
 *    README promete "deixe vazio e cadastre depois" — é o mesmo contrato BYOK
 *    que `lib/agent-engine/env.ts` já documenta. `""` e `undefined` (mock
 *    parcial de `env` nos testes) caem na pública, que é o que rodava antes.
 * 2. **Barra e espaço saem.** O SDK normaliza barra (medido: `http://kong:8000/`
 *    e `http://kong:8000` produzem o mesmo `…/rest/v1/…`), mas um espaço à
 *    direita passa pelo Zod — medido em zod 4.6.5, `z.string().url()` aceita
 *    `"http://kong:8000 "` — e vira URL de host diferente na hora da chamada.
 * 3. **O que não é endereço http(s) NÃO derruba o produto.** É a doutrina
 *    escrita ao lado de `APP_ACCENT_HEX` e `SIGNUP_MODE` em `lib/env.ts`: um
 *    valor irreconhecível degrada com aviso, porque `lib/env.ts` lança na
 *    PRIMEIRA requisição e o healthcheck do contêiner é probe TCP — o Docker
 *    mostraria `healthy` com 100% das requisições em 500 por causa de um `.env`.
 *    Recusar o valor serve a URL pública: a instalação volta ao estado de antes
 *    do erro de digitação, que é de longe o melhor desfecho possível.
 *
 * `publica` nunca é validada aqui: quem a declara (`lib/env.ts:69`) já a exige
 * como URL, e revalidar criaria dois lugares dizendo o que é endereço válido.
 */
export function urlDoSupabaseNoServidor(configurada: string | undefined, publica: string): string {
  const crua = (configurada ?? "").trim();
  if (!crua) return publica;

  if (!E_HTTPS.test(crua) && !E_HTTP.test(crua)) {
    avisarUrlRecusada("SUPABASE_SERVER_URL", crua);
    return publica;
  }

  return crua.replace(/\/+$/, "");
}

/** Só para os testes: o aviso é único por variável, e cada caso precisa de um. */
export function __resetAvisoDaUrlDoServidor(): void {
  avisoDaUrlInvalida.clear();
}
