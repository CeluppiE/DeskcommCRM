/**
 * Os nomes de sessão que os seeds do e2e deixam em `channel_sessions` — a
 * categoria inteira num arquivo só.
 *
 * ─── Por que mora em `lib/channels/` ────────────────────────────────────────
 *
 * Nasceu em `scripts/lib/` junto com a limpeza (PR #1051), onde só os scripts
 * o liam. A #1032 tem uma segunda metade que também precisa reconhecer a
 * categoria: o vigia de saúde (`app/api/v1/cron/channel-health/route.ts`) e a
 * faixa de conexão caída (`lib/channels/health.ts`) não podem tratar uma linha
 * de seed como conexão de alguém — é alarme falso permanente na tela de quem
 * opera. Produção não pode importar de `scripts/`, então a categoria veio para
 * cá, e os dois importadores de antes (`scripts/cleanup-e2e-channel-sessions.ts`
 * e `tests/unit/e2e-sessoes-de-canal-sao-limpas.test.ts`) apontam para aqui:
 * uma só lista, apagada pela limpeza e ignorada pelo vigia.
 *
 * ─── Lista fechada, não prefixo ─────────────────────────────────────────────
 *
 * Os três nomes são fixos e conferidos em teste. Um prefixo `e2e-` aberto
 * excluiria dezena desconhecida de vigia sem ninguém ter decidido — e o caso
 * em que isso machuca é justamente um número real que alguém rotulou com
 * "e2e" no apelido. Quem não está na lista segue vigiado como sempre.
 */

export const NOMES_DE_SESSAO_E2E = [
  "e2e-queue-session",
  "e2e-radar-session",
  "e2e-numero-conectado",
] as const;

export type NomeDeSessaoE2E = (typeof NOMES_DE_SESSAO_E2E)[number];

export function ehNomeDeSessaoE2E(nome: string | null | undefined): nome is NomeDeSessaoE2E {
  return typeof nome === "string" && (NOMES_DE_SESSAO_E2E as readonly string[]).includes(nome);
}
