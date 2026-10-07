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

## O que é realmente nosso hoje (2 mudanças: fix da agenda + namespace de imagem)

| # | O quê | Arquivo(s) | Por quê ainda existe |
|---|---|---|---|
| 1 | **Fix da agenda** | `lib/agenda/protecao-followup.ts` | `.in("contact_id", ...)` sem teto estoura o limite de URL do PostgREST em org com muitos leads abertos. Upstream **ainda não corrigiu** (confirmado contra o HEAD do upstream em 2026-10-06). Já causou incidente real em produção (`risk_agenda_indisponivel`). **Não descartar.** |
| 2 | **Namespace próprio da imagem Docker** | `.env.hostgator.example`, `docker-compose.prod.yml`, `hostgator-setup-kit/_common.sh` | `IMG_NS="ghcr.io/celuppie"` + os defaults `*_IMAGE` (app/worker/scheduler/voice-agent) apontando pro nosso registry, porque o fork publica as próprias imagens. **Nunca** vira PR — é identidade do fork, não melhoria do produto. |

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

## Já absorvido pelo upstream — não reaplicar

- **Kanban/board em lotes** (`34f7e6dcb`, `4986930c9`) — o `app/api/v1/pipelines/[id]/board/route.ts`
  de hoje já usa o `buscaEmLotes()` que o próprio upstream adicionou (v1.48.0,
  `lib/supabase/em-lotes.ts`). Zero diff no arquivo de produção contra o upstream atual.
  Sobrou só `tests/unit/consultas-do-quadro-em-lotes.test.ts`, que duplica a cobertura do
  próprio teste do upstream — pode apagar.

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
  `IMG_NS == ghcr.io/melgarafael`; o fork usa `ghcr.io/celuppie` de propósito (item 2 da tabela).
  **Decisão (2026-10-06): NÃO trocar o anchor `NAMESPACE_DESTE_REPO`.** Ele é a fonte única de onde
  `DONO_DESTE_REPO` deriva (`tests/unit/_identidade-deste-repo.ts`); trocá-lo para `ghcr.io/celuppie`
  puxaria o caso de **URL de clone** (sem skip) a exigir `github.com/celuppie/DeskcommCRM` em **6
  arquivos** (`hostgator-setup-kit/install.sh`, `comecar.sh`, `_common.sh` e os 3 Dockerfiles) que ainda
  apontam para `melgarafael` — ou seja, só trocaria uma falha só-local por uma falha **de CI**, e seria
  uma mudança (de onde o deploy clona o código) fora do escopo desta rodada. O caso tem **skip no CI do
  fork** (`corridaInternaDeFork()` detecta que o runner é de outro dono), então lá fica **verde**. É falha
  **só-local**, da mesma família das de Windows/jsdom/bash dos testes `|cercas|`/CI-only.

## Próxima sincronização (passo a passo, sem surpresa)

1. Rode o comando do topo deste arquivo pra achar o diff real atual — não assuma que a tabela
   acima ainda vale.
2. Reset `main` pro `upstream/main` atual (ou pro ponto que a equipe decidir).
3. Reaplique só os itens 1–2 da tabela (o fix da agenda primeiro — é o que mais importa).
4. Confirme de novo se o upstream não corrigiu o item 1 por outro caminho antes de reaplicar às
   cegas.
5. Rode a verificação do Definition of Done (`CLAUDE.md`) antes de dar push.
