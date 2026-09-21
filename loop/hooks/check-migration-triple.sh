#!/usr/bin/env bash
# check-migration-triple.sh — a tripla de migration é indivisível (doutrina do repo).
# Commit que ADICIONA arquivo em supabase/migrations/*.sql precisa, no MESMO commit:
#   1. mudança em supabase/baseline.sql (apêndice idempotente)
#   2. mudança em supabase/migrations/MANIFEST.md (linha na tabela Applied)
# E o NNNN do nome novo não pode existir em NENHUMA branch local — a cadeia
# vendaval/F2-* tem migrations não mergeadas; colisão de sequência é bug real.
# Bypass (correção orientada pelo dono): DESKCOMM_GOV_MIGRATION_EDIT=1.
set -euo pipefail

[ "${DESKCOMM_GOV_MIGRATION_EDIT:-0}" = "1" ] && exit 0

# Migrations novas (status A) neste commit
new_migrations=$(git diff --cached --name-status \
  | awk '$1 == "A" && $2 ~ /^supabase\/migrations\/.*\.sql$/ { print $2 }')

# ── O que JÁ ESTÁ na `main` não é novidade deste commit ───────────────────
#
# Um `git merge origin/main` encena as migrations da main como status `A`
# relativo à branch, e o guard as tratava como se o autor as tivesse criado.
# O efeito medido em 18/09/2026: o merge da main foi BLOQUEADO acusando 0267,
# 0268 e 0277 — as três já na `main` — como colisão com outra branch, que as
# tinha pelo mesmo motivo (também mergeou a main).
#
# E a orientação do guard era impossível de seguir: "escolha outro NNNN e
# troque o timestamp" aplicado a uma migration que já está na `main` significa
# renumerar arquivo que todo mundo já tem. Não havia resposta certa dentro do
# que ele oferecia — só a válvula de escape, aberta por rotina, que é como uma
# guarda deixa de proteger.
#
# A guarda REAL — colisão de NNNN entre duas branches de trabalho — continua
# inteira: só sai da conta o que é alcançável por `origin/main`.
#
# Sem `origin/main` (clone raso do CI, repositório novo) o filtro é no-op e o
# comportamento antigo vale, em vez de o guard emudecer.
if git rev-parse --verify --quiet origin/main >/dev/null; then
  new_migrations=$(while IFS= read -r p; do
    [ -z "$p" ] && continue
    git cat-file -e "origin/main:$p" 2>/dev/null || printf '%s\n' "$p"
  done <<<"$new_migrations")
fi

[ -z "$new_migrations" ] && exit 0

staged=$(git diff --cached --name-only)

if ! grep -qx 'supabase/baseline.sql' <<<"$staged"; then
  echo "pre-commit BLOQUEADO: migration nova sem apêndice em supabase/baseline.sql no MESMO commit." >&2
  echo "A tripla é indivisível (CLAUDE.md §Migrations): migrations/*.sql + baseline.sql + MANIFEST.md." >&2
  echo "Sem o baseline, self-hosters nunca recebem a mudança. Correção orientada pelo dono: DESKCOMM_GOV_MIGRATION_EDIT=1." >&2
  exit 1
fi

if ! grep -qx 'supabase/migrations/MANIFEST.md' <<<"$staged"; then
  echo "pre-commit BLOQUEADO: migration nova sem linha em supabase/migrations/MANIFEST.md no MESMO commit." >&2
  echo "A tripla é indivisível (CLAUDE.md §Migrations): migrations/*.sql + baseline.sql + MANIFEST.md." >&2
  echo "Correção orientada pelo dono: DESKCOMM_GOV_MIGRATION_EDIT=1." >&2
  exit 1
fi

# Um arquivo pode colidir no NNNN E no timestamp ao mesmo tempo — e colide, na
# maioria das vezes: quem cria migration copiando outra copia os dois. Sair no
# primeiro achado faria o autor renumerar o NNNN, commitar de novo e SÓ ENTÃO
# descobrir o instante. Duas rodadas, e a segunda depende de ele ter lido o
# aviso. Por isso os guards abaixo ACUMULAM: reportam tudo e saem uma vez só.
houve_conflito=0

# Sequência NNNN única contra TODAS as branches locais
while IFS= read -r path; do
  fname=$(basename "$path")
  nnnn=$(sed -nE 's/^[0-9]+_([0-9]{4})_.+\.sql$/\1/p' <<<"$fname")
  if [ -z "$nnnn" ]; then
    echo "pre-commit BLOQUEADO: '$fname' não segue o padrão <timestamp>_<NNNN>_<slug>.sql do repo." >&2
    exit 1
  fi
  while IFS= read -r branch; do
    conflict=$(git ls-tree -r --name-only "$branch" -- supabase/migrations 2>/dev/null \
      | grep -E "^supabase/migrations/[0-9]+_${nnnn}_.+\.sql$" || true)
    if [ -n "$conflict" ]; then
      echo "pre-commit BLOQUEADO: sequência NNNN=$nnnn de '$fname' já existe na branch '$branch':" >&2
      echo "  $conflict" >&2
      echo "Escolha o próximo NNNN livre em TODAS as branches locais (git branch --format='%(refname:short)' + git ls-tree)." >&2
      echo "E troque o TIMESTAMP JUNTO: renumerar só o NNNN fabricou 12 das colisões de timestamp deste repo." >&2
      echo "Correção orientada pelo dono: DESKCOMM_GOV_MIGRATION_EDIT=1." >&2
      houve_conflito=1
      break
    fi
  done < <(git branch --format='%(refname:short)')
done <<<"$new_migrations"


# ── TIMESTAMP único contra TODAS as branches locais ──────────────────────
#
# O timestamp é a PK de `supabase_migrations.schema_migrations`: repetido, o
# `db push` colide na PK e o `db reset` quebra. A issue #143 já renomeou quatro
# pares por isso — não é hipótese.
#
# ⚠️ E metade das colisões vivas foi FABRICADA POR ESTE HOOK. Ao exigir NNNN novo
# quando havia conflito entre branches, ele fazia trocar o NÚMERO e deixava o
# instante intacto. Medido em 2026-08-27, sobre 754 refs: das 25 colisões de
# timestamp, 12 eram exatamente isso. Por isso a mensagem do NNNN, acima, manda
# trocar os dois.
#
# CATRACA: os 13 instantes abaixo já são compartilhados por migrations DISTINTAS
# em branches ainda não mergeadas. Gate que nasce vermelho não entra, então ficam
# congelados — e a lista só ENCOLHE: quando aquelas branches mergearem ou
# morrerem, a entrada some daqui. Os outros 12 NÃO entram na catraca: neles a
# colisão é o mesmo arquivo renumerado, artefato e não defeito, e congelar ruído
# esconderia o sinal.
DIVIDA_DE_TIMESTAMP="
20260717190000 20260718160000 20260721120000 20260722160000 20260805120000
20260805200000 20260807160000 20260820120000 20260822190000 20260824120000
20260825120000 20260826190000 20260827010000
"

while IFS= read -r path; do
  fname=$(basename "$path")
  ts=$(sed -nE 's/^([0-9]{14})_[0-9]{4}_.+\.sql$/\1/p' <<<"$fname")
  [ -z "$ts" ] && continue
  grep -qw "$ts" <<<"$DIVIDA_DE_TIMESTAMP" && continue

  while IFS= read -r branch; do
    conflict=$(git ls-tree -r --name-only "$branch" -- supabase/migrations 2>/dev/null \
      | grep -E "^supabase/migrations/${ts}_[0-9]{4}_.+\.sql$" \
      | grep -v "^supabase/migrations/${fname}$" || true)
    if [ -n "$conflict" ]; then
      echo "pre-commit BLOQUEADO: o TIMESTAMP $ts de '$fname' já existe na branch '$branch':" >&2
      echo "  $conflict" >&2
      echo "O timestamp é a PK de supabase_migrations.schema_migrations: repetido, o db push colide na PK e o db reset quebra (issue #143)." >&2
      echo "Escolha um instante livre — e renumerar só o NNNN não resolve: os dois têm de ser únicos." >&2
      echo "Correção orientada pelo dono: DESKCOMM_GOV_MIGRATION_EDIT=1." >&2
      houve_conflito=1
      break
    fi
  done < <(git branch --format='%(refname:short)')
done <<<"$new_migrations"

[ "$houve_conflito" = 1 ] && exit 1
exit 0
