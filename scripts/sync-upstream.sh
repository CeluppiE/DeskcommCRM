#!/usr/bin/env bash
# sync-upstream.sh — sincroniza o fork com o upstream sem perder os patches.
#
# ## O problema que isto resolve
#
# O repositório original (upstream) lança entre 8 e 15 versões a cada 2 dias.
# Este fork existe para aplicar um pequeno número de patches próprios por cima
# do que o upstream publica. A estratégia é "espelho + patches": o `main`
# daqui não acumula história própria, ele É o upstream mais os patches,
# reaplicados a cada sincronização.
#
# Isso significa que o trabalho manual de toda atualização era: achar onde os
# patches estão no histórico atual, resetar para o upstream novo, reaplicá-los
# (resolvendo conflito se o upstream mudou algo perto), e publicar uma
# Release nova na HEAD (o `update.sh` da VPS resolve "última release
# publicada", não "última tag" — sem Release nova, o deploy nem vê os patches).
# Esse script automatiza as quatro etapas.
#
# ## Por que patches em arquivo, e não cherry-pick direto de SHA
#
# Cherry-pick por SHA quebra sozinho: a cada sync os patches ganham SHA novo
# (foram replantados em cima de um upstream diferente), então "a lista de SHAs
# dos patches" fica desatualizada na sincronização seguinte. Patch em arquivo
# (`git format-patch` / `git am`) é o diff em si, independente de onde ele vai
# ser aplicado — é o padrão usado por quem mantém pacotes/forks há décadas
# (dpkg, RPM, kernel) exatamente por isto.
#
# ## Uso
#
#   ./sync-upstream.sh init              # uma vez só, veja abaixo
#   ./sync-upstream.sh sync              # mostra o plano, não publica nada
#   ./sync-upstream.sh sync --yes        # executa de verdade (push + release)
#
# ### `init` (rodar uma única vez, hoje, com o fork no estado atual)
#
# Exporta os commits que o fork tem além do upstream para `fork-patches/*.patch`
# (um deles passa a ser a própria pasta `fork-patches/`, o que é intencional —
# ela se recria sozinha a cada sync). Rode, confira a lista impressa, e comite
# a pasta:
#
#   git add fork-patches/
#   git commit -m "chore: registra patches do fork para sincronização automatizada"
#   git push
#
# Depois disso o `init` só precisa rodar de novo se um patch for reescrito à
# mão (ver "Se der conflito" mais abaixo) ou se um novo patch próprio nascer.
#
# ### `sync` (toda vez que o upstream lançar algo novo)
#
# 1. busca a última tag do upstream;
# 2. copia os patches de `fork-patches/` para fora do repo (necessário: o
#    branch do upstream, criado no passo 3, não tem essa pasta — ela só existe
#    na árvore do `main` do fork);
# 3. cria um branch a partir da tag do upstream;
# 4. aplica cada patch copiado, em ordem;
# 5. se tudo aplicar limpo, calcula a tag nova (`v<versão>-a<N>`), e — só com
#    `--yes` — força o `main` do fork pra esse estado, sobe a tag e publica a
#    Release no GitHub.
#
# Sem `--yes` o script só IMPRIME o que faria (upstream encontrado, patches que
# aplicariam, tag que sairia) e não toca em nada remoto. É o jeito de revisar
# antes de forçar um push em `main`.
#
# ## Se der conflito ao aplicar um patch
#
# O upstream mudou algo perto do que o patch toca. O script aborta (`git am
# --abort`) e NÃO toca em `main` — o fork continua no estado anterior, intacto.
# Para resolver:
#
#   git checkout -b conserto-patch sync/<tag-que-falhou>   # branch criado pelo script, ainda existe
#   git am --3way fork-patches/000N-*.patch                # reaplica só esse, agora com conflito à mostra
#   # edite os arquivos em conflito, depois:
#   git add -A && git am --continue
#   git checkout main
#   git format-patch -1 conserto-patch -o fork-patches/ --start-number N  # regrava o patch corrigido
#   git add fork-patches/ && git commit -m "fix: atualiza patch NNN para o upstream novo"
#   git push
#
# Rode `./sync-upstream.sh sync --yes` de novo depois.
#
# ## Por que force-push em `main` aqui é intencional, não descuido
#
# Numa estratégia de espelho, `main` não é um branch colaborativo com história
# própria — ele É o espelho. Forçar é o ponto. Usamos `--force-with-lease` (não
# `--force` puro) para o único risco real: abortar se alguém push alguma coisa
# em `main` entre o fetch e o push deste script, em vez de sobrescrever às
# escuras. Se o `main` tiver proteção de branch contra force-push, o passo de
# push vai falhar com uma mensagem clara do GitHub — nesse caso, ou ajuste a
# regra de proteção para permitir force-push de quem mantém o fork, ou rode o
# push manualmente (o script já deixa o branch `sync/<tag>` pronto pra isso).

set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/melgarafael/DeskcommCRM.git}"
UPSTREAM_REMOTE="upstream"
# ATENÇÃO: NÃO chame isto de "patches/" — este repo já usa essa pasta para os
# patches de dependência do pnpm (`pnpm.patchedDependencies`, ex.:
# patches/@react-pdf__hyphenate.patch). Um `rm -rf` ali apagaria patch de
# dependência por engano. "fork-patches/" é só nossa.
PATCHES_DIR="fork-patches"
MAIN_BRANCH="main"

log()  { printf '\033[1;34m[sync]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31m[erro]\033[0m %s\n' "$1" >&2; exit 1; }

garantir_repo_git() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "rode isto de dentro do clone do fork (não é um repositório git aqui)."
}

garantir_arvore_limpa() {
  [ -z "$(git status --porcelain)" ] \
    || die "há mudanças não commitadas. Commite, descarte ou dê stash antes de sincronizar."
}

garantir_remote_upstream() {
  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    log "remote '$UPSTREAM_REMOTE' não existe — adicionando ($UPSTREAM_URL)"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  fi
}

# Resolve "owner/repo" a partir do remote origin, pra nunca depender do `gh`
# adivinhar sozinho — num fork, `gh` sem -R pode mirar no repositório upstream
# (o "pai" do fork) em vez do nosso, e falhar com 403 se o token só tiver
# acesso ao fork.
repo_origin_slug() {
  local url="$(git remote get-url origin)"
  url="${url#https://github.com/}"
  url="${url#git@github.com:}"
  url="${url%.git}"
  printf '%s' "$url"
}

ultima_tag_upstream() {
  # Tags no formato vX.Y.Z (ou X.Y.Z sem o "v" — normalizamos pra sempre ter "v").
  git ls-remote --tags --refs "$UPSTREAM_REMOTE" \
    | awk '{print $2}' | sed 's#refs/tags/##' \
    | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
    | sed 's/^\([0-9]\)/v\1/' \
    | sort -V | tail -1
}

proxima_tag_fork() {
  local base="$1" # ex.: v1.75.0
  local n=1
  while git show-ref --tags --verify --quiet "refs/tags/${base}-a${n}" \
        || git ls-remote --tags origin "refs/tags/${base}-a${n}" | grep -q .; do
    n=$((n + 1))
  done
  printf '%s-a%d' "$base" "$n"
}

cmd_init() {
  garantir_repo_git
  garantir_remote_upstream
  log "buscando $UPSTREAM_REMOTE..."
  git fetch "$UPSTREAM_REMOTE" --tags --quiet

  local base
  base="$(git merge-base HEAD "${UPSTREAM_REMOTE}/${MAIN_BRANCH}" 2>/dev/null)" \
    || die "não achei um ponto comum entre HEAD e ${UPSTREAM_REMOTE}/${MAIN_BRANCH}. Confirme o branch padrão do upstream (ver UPSTREAM_URL)."

  # Nunca rm -rf a pasta inteira — limpamos só os *.patch que o format-patch
  # numera (0001-*.patch em diante), nunca outro arquivo que alguém tenha posto ali.
  mkdir -p "$PATCHES_DIR"
  find "$PATCHES_DIR" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.patch' -delete 2>/dev/null || true
  git format-patch "${base}..HEAD" -o "$PATCHES_DIR" >/dev/null

  local n
  n=$(find "$PATCHES_DIR" -name '*.patch' | wc -l | tr -d ' ')
  if [ "$n" -eq 0 ]; then
    warn "nenhum patch exportado — HEAD já é igual ao ponto comum com o upstream?"
    rmdir "$PATCHES_DIR" 2>/dev/null || true
    return 0
  fi

  log "$n patch(es) exportado(s) para $PATCHES_DIR/:"
  find "$PATCHES_DIR" -name '*.patch' | sort | sed 's/^/  /'
  echo
  log "revise a lista acima. Se estiver certa, comite:"
  echo "    git add $PATCHES_DIR/"
  echo "    git commit -m 'chore: registra patches do fork para sincronização automatizada'"
  echo "    git push"
}

cmd_sync() {
  local executar=0
  [ "${1:-}" = "--yes" ] && executar=1

  garantir_repo_git
  garantir_arvore_limpa
  [ -d "$PATCHES_DIR" ] && [ -n "$(find "$PATCHES_DIR" -name '*.patch' 2>/dev/null)" ] \
    || die "não há patches em $PATCHES_DIR/. Rode '$0 init' primeiro (uma vez só)."
  garantir_remote_upstream

  # Copia os patches pra fora do repo ANTES de trocar de branch: o branch que
  # criamos a seguir parte da tag do upstream, que nunca teve fork-patches/ na
  # árvore dele (essa pasta só existe no histórico do fork). Ler $PATCHES_DIR
  # depois do checkout falha com "No such file or directory" — já aconteceu.
  local patches_tmp
  patches_tmp="$(mktemp -d)"
  trap 'rm -rf "$patches_tmp"' EXIT
  cp "$PATCHES_DIR"/*.patch "$patches_tmp"/

  log "buscando $UPSTREAM_REMOTE..."
  git fetch "$UPSTREAM_REMOTE" --tags --quiet
  git fetch origin --tags --quiet

  local upstream_tag
  upstream_tag="$(ultima_tag_upstream)"
  [ -n "$upstream_tag" ] || die "não encontrei nenhuma tag vX.Y.Z no upstream."
  log "última versão do upstream: $upstream_tag"

  local fork_tag
  fork_tag="$(proxima_tag_fork "$upstream_tag")"
  log "tag que este sync geraria no fork: $fork_tag"

  local branch_sync="sync/${fork_tag}"
  git branch -D "$branch_sync" >/dev/null 2>&1 || true
  git checkout -q -B "$branch_sync" "$upstream_tag"

  log "aplicando patches de $PATCHES_DIR/ (copiados pra $patches_tmp antes do checkout) ..."
  if ! git am --3way "$patches_tmp"/*.patch; then
    git am --abort >/dev/null 2>&1 || true
    git checkout -q "$MAIN_BRANCH" >/dev/null 2>&1 || true
    die "conflito ao aplicar um patch contra $upstream_tag. '$MAIN_BRANCH' não foi tocado. Veja as instruções 'Se der conflito' no topo deste script (o branch '$branch_sync' continua aqui para você consertar)."
  fi
  log "patches aplicados limpo sobre $upstream_tag."

  if [ "$executar" -ne 1 ]; then
    echo
    warn "modo visualização (sem --yes) — nada foi publicado."
    log "o que rodaria com --yes:"
    echo "    git push origin ${branch_sync}:${MAIN_BRANCH} --force-with-lease"
    echo "    git tag -a ${fork_tag} -m '${fork_tag}' ${branch_sync}"
    echo "    git push origin ${fork_tag}"
    echo "    gh release create ${fork_tag} --target ${MAIN_BRANCH} --title ${fork_tag} -R $(repo_origin_slug) --generate-notes"
    echo
    log "branch local '$branch_sync' deixado criado para você inspecionar (git log, git diff ${MAIN_BRANCH}..${branch_sync})."
    exit 0
  fi

  log "publicando: push em $MAIN_BRANCH, tag $fork_tag e Release no GitHub..."
  git push origin "${branch_sync}:${MAIN_BRANCH}" --force-with-lease
  git tag -a "$fork_tag" -m "$fork_tag" "$branch_sync"
  git push origin "$fork_tag"
  gh release create "$fork_tag" --target "$MAIN_BRANCH" --title "$fork_tag" \
    -R "$(repo_origin_slug)" \
    --notes "Sincronizado com upstream ${upstream_tag}. Patches aplicados: $(find "$patches_tmp" -name '*.patch' | wc -l | tr -d ' ')." \
    || warn "'gh release create' falhou — crie a Release manualmente apontando pra tag ${fork_tag} (target ${MAIN_BRANCH})."

  git checkout -q "$MAIN_BRANCH"
  git branch -D "$branch_sync" >/dev/null 2>&1 || true

  echo
  log "pronto: $fork_tag publicada."
  log "próximo passo na VPS: bash hostgator-setup-kit/update.sh --to ${fork_tag}"
}

case "${1:-}" in
  init) cmd_init ;;
  sync) shift; cmd_sync "${1:-}" ;;
  *)
    echo "uso: $0 init | sync [--yes]"
    exit 1
    ;;
esac
