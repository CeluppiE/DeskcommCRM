# Divergência do fork — o que é realmente nosso

> Substitui `docs/HANDOFF-atualizacao-v1.60.md` (commit `a0bca2b9b`/`2efb43a72`), que listava
> **9 commits** antes do merge do v1.60.0. Depois do merge (`d1b21f5b4`), boa parte desses commits
> foi **absorvida/reconciliada** — o kanban/board, por exemplo, passou a usar o `buscaEmLotes()` do
> próprio upstream (commit `4c209a426`), e sobrou só um teste duplicado nosso. Confiar na lista de
> commits é o erro: commit não cancela commit no histórico, mas o CONTEÚDO pode ter sido substituído
> no merge. A régua é o diff de árvore, não o log.

## Leia isto ANTES de qualquer merge/sync com upstream — e reconfira, não confie na lista

A lista abaixo foi medida em **2026-10-06**. Ela vai ficar desatualizada de novo. Antes de
confiar nela, rode o comando — ele acha o ponto de divergência real contra o HEAD atual do
upstream, não uma tag fixa que pode já estar velha:

```bash
git fetch upstream --quiet
BASE=$(git merge-base origin/main upstream/main)
git diff "$BASE" origin/main --stat
```

Se a lista de arquivos que sair daí for diferente da tabela abaixo, **esta tabela está velha** —
atualize-a (e esta nota), não o contrário.

## O que é realmente nosso hoje (2 mudanças: namespace de imagem + identidade de versão)

| # | O quê | Arquivo(s) | Por quê ainda existe |
|---|---|---|---|
| 1 | **Namespace próprio da imagem Docker** | `.env.hostgator.example`, `docker-compose.prod.yml`, `hostgator-setup-kit/_common.sh` | `IMG_NS="ghcr.io/celuppie"` + os defaults `*_IMAGE` (app/worker/scheduler/voice-agent) apontando pro nosso registry, porque o fork publica as próprias imagens. **Nunca** vira PR — é identidade do fork, não melhoria do produto. |
| 2 | **Identidade de versão aceita sufixo `-aN`** | `hostgator-setup-kit/_runtime.sh`, `lib/system/runtime-identity.ts` | O regex de versão só casava `vX.Y.Z` puro; toda release deste fork sai como `vX.Y.Z-aN`, então a verificação de identidade em execução nunca confirmava a própria versão — "não confirmado" pra sempre, inclusive pros clientes do white-label que não têm como agir nisso. **Nunca** vira PR — o sufixo `-aN` só existe neste fork. |

### Nota desta rodada — 2026-10-06 (redução a 2 mudanças)

O `main` foi resetado direto no `upstream/main` atual e o fork ficou reduzido a **2 mudanças reais**:
o **fix da agenda** (item 1) e o **namespace próprio da imagem Docker** (item 2). Os patches antigos
de **dark mode nos selects** e os **dois de robustez do kit de deploy** foram descartados — ver a seção
"Baixo valor, pode descartar sem dor". Decidiu-se **não** mexer no anchor `NAMESPACE_DESTE_REPO` do teste
`tests/unit/namespace-das-imagens.test.ts` — ver a seção "Falhas conhecidas — não corrigir".

**Verificação final** rodada num ambiente de nuvem (não a máquina Windows, que não tem RAM suficiente):
`typecheck` e `lint` limpos, e os testes que cobrem o fix da agenda (`agenda-protecao-followup.test.ts` +
`agenda-efeito-followup.test.ts`) passaram **21/21** isolados. A suíte completa e o `build` **não foram
concluídos localmente em nenhum ambiente** — o próprio `.github/workflows/ci.yml` do projeto documenta que
esse passo precisa de **~16 GB de RAM** (runner público), que nem a máquina Windows (3,5 GB livres) nem o
ambiente de nuvem usado (7,8 GB) têm. Fica a cargo do **CI do fork no GitHub Actions**, que é o ambiente
dimensionado pra isso.

### Nota desta rodada — 2026-11-07 (fix da agenda aposentado; identidade de versão documentada)

O **fix da agenda** (item 1 da tabela até esta rodada) foi **retirado** de `fork-patches/` — o
upstream resolveu o mesmo bug sozinho, na v1.103.0 (commit `5b20efae8`, PR #4124), com uma
implementação melhor que a nossa: lotes em paralelo (4 por vez) e isolamento de falha por lote (um
lote que falha só adia os contatos **daquele** lote, não todo mundo — a nossa versão ainda carregava
esse risco, só numa escala menor). Ver a entrada nova em "Já absorvido pelo upstream" abaixo.

Também ficou registrado aqui pela primeira vez o patch de **identidade de versão**
(`fork-patches/0005`, criado em 2026-11-03, nunca documentado neste arquivo até agora): sem ele,
nenhuma instalação deste fork confirma a própria versão em execução, porque o regex de runtime só
aceitava `vX.Y.Z` e toda release do fork sai como `vX.Y.Z-aN`.

Com isso, a tabela continua com **2 mudanças reais** — não por coincidência de contagem, mas porque
uma saiu (agenda) e uma que já existia só não estava documentada (identidade de versão) entrou.

> **Nota operacional desta rodada**: a primeira tentativa de registrar esta mudança (commit
> `0067617`) editou este arquivo direto em `main`, sem regenerar a patch `0003` que o recria do
> zero a cada sync — o `sync-upstream.sh sync --yes` seguinte sobrescreveu a edição silenciosamente,
> porque `main` é descartável por design (é reconstruído a partir da tag do upstream + patches, não
> editado em cima). A correção virou a patch `fork-patches/0006` abaixo, deste commit em diante:
> **qualquer edição de conteúdo neste arquivo (ou em qualquer arquivo só nosso) precisa virar uma
> patch nova em `fork-patches/`, nunca só um commit direto em `main`** — senão o próximo sync apaga
> a edição sem avisar.

## Já absorvido pelo upstream — não reaplicar

- **Kanban/board em lotes** (`34f7e6dcb`, `4986930c9`) — o `app/api/v1/pipelines/[id]/board/route.ts`
  de hoje já usa o `buscaEmLotes()` que o próprio upstream adicionou (v1.48.0,
  `lib/supabase/em-lotes.ts`). Zero diff no arquivo de produção contra o upstream atual.
  Sobrou só `tests/unit/consultas-do-quadro-em-lotes.test.ts`, que duplica a cobertura do
  próprio teste do upstream — pode apagar.
- **Fix da agenda em lotes** (era `fork-patches/0001`) — o upstream corrigiu o mesmo bug na v1.103.0
  (commit `5b20efae8`, PR #4124: "a proteção de agenda lê os contatos em lotes, não num `.in()` só").
  A versão deles usa a mesma constante compartilhada `IDS_POR_LOTE` de `lib/supabase/em-lotes.ts` e vai
  além do nosso patch: lotes em paralelo e isolamento de falha por lote. Confirmado arquivo a arquivo
  contra `v1.99.0..v1.103.0` (`git diff v1.99.0 origin/main --stat`): nenhuma outra mudança nossa foi
  afetada.

## Baixo valor, pode descartar sem dor

- `lib/i18n/dicionario.ts` + `app/app/kanban/_components/ImportarLeads.tsx` — texto de aviso de
  limite (500 linhas/5MB) no importador de leads. Baixo valor, não bloqueia nada.
- `tests/e2e/agenda-presenca-recuperacao.spec.ts` — bump de timeout do assert do Radar. O upstream
  corrigiu o mesmo teste flaky de forma mais robusta no v1.63.0 (espera a resposta da API em vez de
  deadline fixo) — o bump ficou obsoleto.
- **Dark mode nos selects** (`app/app/settings/tenant/financeiro/_client.tsx`, `_comissao.tsx`,
  `_recorrencias.tsx`, `components/agenda/DiasBloqueados.tsx`) **e os dois patches de robustez do kit de
  deploy** (`dc()`/`dc_files()` incluindo `docker-compose.test.yml` quando presente; retry do
  `--force-recreate` do caddy antes de só avisar) — avaliados e **descartados por decisão explícita do
  Eduardo em 2026-10-06**. O custo de reconciliar isso a cada sync com o upstream (que reescreveu
  `dc()`/`dc_files()` para a CA do Supabase e SINGLE_SERVER×REVERSE_PROXY) não compensava o ganho:
  cosmético num caso, robustez incremental no outro. Podem ser revisitados individualmente no futuro se
  fizerem falta de novo (SHAs no reflog/histórico: dark mode `daaaabe0f`+`85e9c242d`; kit `9104d5b47`
  (compose de teste) e `adfeb80fd` (retry do caddy)).

## Falhas conhecidas — não corrigir

- **`tests/unit/namespace-das-imagens.test.ts` falha LOCALMENTE por design.** O teste exige
  `IMG_NS == ghcr.io/melgarafael`; o fork usa `ghcr.io/celuppie` de propósito (item 1 da tabela).
  **Decisão (2026-10-06): NÃO trocar o anchor `NAMESPACE_DESTE_REPO`.** Ele é a fonte única de onde
  `DONO_DESTE_REPO` deriva (`tests/unit/_identidade-deste-repo.ts`); trocá-lo para `ghcr.io/celuppie`
  puxaria o caso de **URL de clone** (sem skip) a exigir `github.com/celuppie/DeskcommCRM` em **6
  arquivos** (`hostgator-setup-kit/install.sh`, `comecar.sh`, `_common.sh` e os 3 Dockerfiles) que ainda
  apontam para `melgarafael` — ou seja, só trocaria uma falha só-local por uma falha **de CI**, e seria
  uma mudança (de onde o deploy clona o código) fora do escopo desta rodada. O caso tem **skip no CI do
  fork** (`corridaInternaDeFork()` detecta que o runner é de outro dono), então lá fica **verde**. É falha
  **só-local**, da mesma família das de Windows/jsdom/bash dos testes `|cercas|`/CI-only.

## Próxima sincronização (passo a passo, sem surpresa)

> Hoje os passos 1–3 são automatizados por `scripts/sync-upstream.sh sync` — os passos abaixo
> continuam valendo como checklist conceitual, e o passo 4 ele não faz sozinho: precisa de alguém
> olhando cada item da tabela contra o changelog do upstream. **E qualquer edição de CONTEÚDO num
> arquivo que uma patch recria (como este doc) precisa virar patch nova — ver a nota operacional
> acima.**

1. Rode o comando do topo deste arquivo pra achar o diff real atual — não assuma que a tabela
   acima ainda vale.
2. Reset `main` pro `upstream/main` atual (ou pro ponto que a equipe decidir).
3. Reaplique os itens que ainda sobrarem na tabela.
4. Confirme de novo, pra CADA item, se o upstream não absorveu ele por outro caminho antes de
   reaplicar às cegas — foi exatamente isso que aconteceu com o fix da agenda nesta rodada.
5. Rode a verificação do Definition of Done (`CLAUDE.md`) antes de dar push.
