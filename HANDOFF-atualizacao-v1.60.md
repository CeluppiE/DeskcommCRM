# HANDOFF — Atualização para v1.60 (o que é nosso, antes do merge)

> Este arquivo existe para não perder de vista, durante o merge de 1841 commits do
> upstream (v1.42 → v1.60), o que é customização própria do fork e por quê. Escrito
> **antes** de puxar os arquivos novos — não depois.

## Estado da divergência (medido em 2026-09-28)

- `main` deste fork separou de `upstream/main` em **2026-09-20**, no commit
  `7acf480fd` (logo após `Merge tag 'v1.41.0'`).
- Desde então: **9 commits próprios** aqui, **1841 commits** só no upstream
  (v1.42.0 até v1.60.0 — 19 releases).
- Achado concreto de segurança que o upstream já tem e nós não: `69ad13b32`
  atualiza `hono` para 4.13.8 e `js-yaml` para 4.3.2, fechando 4 avisos de
  segurança das dependências.

## Mudanças no funil/kanban (atenção redobrada no merge)

Três dos nove commits existem porque o board/kanban e a agenda estouravam o
limite de URL do PostgREST em funis grandes (1003 leads no funil "Disparo") —
o filtro `.in()` cresce com o número de leads e passa do buffer de cabeçalho
do proxy na frente do Supabase, derrubando a conexão crua em vez de dar um
erro tratável.

- **`34f7e6dcb` — fix(kanban): quebra em lotes as consultas do quadro que
  escalam com o funil.** `app/api/v1/pipelines/[id]/board/route.ts` fazia até
  4 consultas `.in()` sem teto (`withScores`, `withConversas`,
  `withNextActions`). Um funil de 500 leads gerava uma URL de ~18KB, o dobro
  do limite default do Nginx. Agora vai em lotes de 100 ids, com um helper
  local `emLotes()` — mesmo padrão já usado em
  `lib/leads/radar-de-risco.ts` (`IDS_POR_CONSULTA`) e
  `lib/extensions/service.ts` (`IN_BATCH`).
- **`4986930c9` — fix(board): agrupa em lotes as consultas de contatos e
  inbox que faltaram no fix anterior.** `withMarcadoresDoContato` e
  `avisaAmbiguas`, no mesmo arquivo, ainda usavam `.in()` direto — mesma
  causa raiz, faltou cobrir no fix anterior. Tem teste de regressão por
  leitura de fonte (`tests/unit/consultas-do-quadro-em-lotes.test.ts`)
  cobrindo as 6 consultas que passam pelo helper, pra pegar se alguém
  "simplificar de volta" num refactor futuro.
- **`4499fc52e` — fix(agenda): consulta de compromissos em lotes de 100
  contatos.** Mesmo padrão, mesma causa raiz, em
  `lib/agenda/protecao-followup.ts` — sem o fix, `protecaoAgendaSupabase`
  falhava por inteiro numa org com muitos leads abertos e adiava cobrança
  pra todo mundo.

**No merge**: se o upstream já resolveu o estouro de URL do PostgREST de
outra forma (paginação, RPC, o que for) nesses mesmos arquivos, o fix deles
provavelmente substitui os três acima — não é pra reaplicar por cima às
cegas. Se o upstream não tocou nisso, os três continuam necessários e
precisam sobreviver ao merge.

## Outras mudanças próprias

- **`daaaabe0f` + `85e9c242d`** — select ilegível no tema escuro (sem
  `bg-surface`/`text-text`) em 4 arquivos de financeiro e agenda. Puramente
  visual, sem lógica de negócio — conflito aqui é raso se acontecer.
- **`abacb43252`** — o diálogo de importar leads não avisava o limite de
  500 linhas/5MB antes do upload; alinhado ao texto que o importador de
  contatos já usava.
- **`9104d5b47`** — `dc()`/`dc_files()` (hostgator-setup-kit) passam a
  incluir `docker-compose.test.yml` sozinhos, sem precisar de flag manual.
- **`adfeb80fd`** — retry (3x, 2s de intervalo) no force-recreate do caddy
  em `update.sh`, que falhava às vezes por corrida de porta 80.
- **`3c263468`** — namespace do registry de imagens (GHCR) trocado de
  `ghcr.io/melgarafael` pro nosso fork. **Este é o único 100% específico do
  fork** — nunca deve virar PR pro upstream, e é o mais provável de gerar
  conflito real se o upstream mexeu nos mesmos arquivos
  (`_common.sh`, `docker-compose.prod.yml`, `.env.hostgator.example`).

## Candidatos a PR pro upstream (fora do escopo deste merge, decidir depois)

`daaaabe0f`/`85e9c242d` (select no tema escuro) e `adfeb80fd` (retry do
caddy) não têm nada específico deste fork — são bugs reais de qualquer
instalação do DeskcommCRM. Os três de lote (kanban/board/agenda) também são
candidatos, mas primeiro precisa confirmar que o upstream não resolveu o
mesmo problema de outro jeito. `3c263468` (namespace do registry) nunca é
candidato.

## Próximo passo

Puxar os arquivos novos do upstream (v1.60.0) numa branch separada, ver o
tamanho real dos conflitos contra estes 9 commits, e para cada conflito
decidir usando a lista acima: já resolvido lá → descarta o nosso; ainda
necessário → reaplica em cima da base nova.
