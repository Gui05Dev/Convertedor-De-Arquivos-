#!/usr/bin/env bash
#
# deploy.sh — promoção automática do frontend pelo pipeline de branches.
#
# Fluxo: commita o que está na árvore de trabalho na branch de origem (dev),
# empurra, e vai promovendo (merge + push) branch a branch:
#
#     dev  ->  qas  ->  main
#
# No final volta pra branch de origem, pra você continuar trabalhando nela.
#
# Uso:
#   ./deploy.sh -m "feat: nova tela de upload"
#   ./deploy.sh -m "fix: corrige split" --no-build      # não roda o vite build
#   ./deploy.sh -m "hotfix" --to qas                    # promove só até qas
#   ./deploy.sh -m "wip" -n                             # dry-run, só mostra
#   ./deploy.sh -m "release" -y                         # sem confirmação
#
set -euo pipefail

# ---------------------------------------------------------------- configuração

# Ordem do pipeline. A primeira é a branch de trabalho/origem.
PIPELINE=(dev qas main)
REMOTE="${DEPLOY_REMOTE:-origin}"

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MESSAGE=""
RUN_BUILD=1
RUN_TESTS=0
DRY_RUN=0
ASSUME_YES=0
STOP_AT=""

# ------------------------------------------------------------------ utilidades

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'

log()   { printf '%s\n' "${C_BLUE}==>${C_RESET} ${C_BOLD}$*${C_RESET}"; }
ok()    { printf '%s\n' "${C_GREEN}  ✓${C_RESET} $*"; }
warn()  { printf '%s\n' "${C_YELLOW}  !${C_RESET} $*" >&2; }
die()   { printf '%s\n' "${C_RED}erro:${C_RESET} $*" >&2; exit 1; }

# Executa (ou apenas mostra, em dry-run) um comando.
run() {
  if (( DRY_RUN )); then
    printf '%s\n' "  ${C_YELLOW}[dry-run]${C_RESET} $*"
    return 0
  fi
  "$@"
}

usage() {
  # Imprime o cabeçalho de comentários do próprio arquivo como ajuda.
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"
  exit "${1:-0}"
}

# -------------------------------------------------------------------- argumentos

while (( $# )); do
  case "$1" in
    -m|--message)  MESSAGE="${2:-}"; shift 2 ;;
    -m=*|--message=*) MESSAGE="${1#*=}"; shift ;;
    --to)          STOP_AT="${2:-}"; shift 2 ;;
    --to=*)        STOP_AT="${1#*=}"; shift ;;
    --no-build)    RUN_BUILD=0; shift ;;
    --test)        RUN_TESTS=1; shift ;;
    -n|--dry-run)  DRY_RUN=1; shift ;;
    -y|--yes)      ASSUME_YES=1; shift ;;
    -h|--help)     usage 0 ;;
    *)             die "opção desconhecida: $1 (use --help)" ;;
  esac
done

# Recorta o pipeline se veio --to.
if [[ -n "$STOP_AT" ]]; then
  cut=-1
  for i in "${!PIPELINE[@]}"; do
    [[ "${PIPELINE[$i]}" == "$STOP_AT" ]] && cut=$i
  done
  (( cut >= 0 )) || die "--to '$STOP_AT' não está no pipeline (${PIPELINE[*]})"
  PIPELINE=("${PIPELINE[@]:0:$((cut + 1))}")
fi

SOURCE_BRANCH="${PIPELINE[0]}"

# ------------------------------------------------------------------ pré-checagem

command -v git >/dev/null 2>&1 || die "git não encontrado no PATH."

cd "$FRONTEND_DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "este diretório não está em um repositório git. Rode 'git init' e configure o remote '$REMOTE' antes."

REPO_ROOT="$(git rev-parse --show-toplevel)"

HAS_REMOTE=0
if git remote get-url "$REMOTE" >/dev/null 2>&1; then
  HAS_REMOTE=1
else
  warn "remote '$REMOTE' não configurado — nada será enviado, só merges locais."
fi

# Garante que a branch exista localmente: usa a do remote se houver,
# senão cria a partir do HEAD atual.
ensure_branch() {
  local branch="$1"
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    return 0
  fi
  if (( HAS_REMOTE )) && git show-ref --verify --quiet "refs/remotes/$REMOTE/$branch"; then
    log "criando branch local '$branch' a partir de $REMOTE/$branch"
    run git branch "$branch" "$REMOTE/$branch"
  else
    log "branch '$branch' não existe — criando a partir de HEAD"
    run git branch "$branch"
  fi
}

# Troca de branch preservando nada: a árvore precisa estar limpa nesse ponto.
switch_to() {
  local branch="$1"
  ensure_branch "$branch"
  run git checkout "$branch"
  if (( HAS_REMOTE )) && git show-ref --verify --quiet "refs/remotes/$REMOTE/$branch"; then
    # --ff-only: se divergiu, para aqui em vez de criar merge commit surpresa.
    run git pull --ff-only "$REMOTE" "$branch" \
      || die "'$branch' divergiu de $REMOTE/$branch. Resolva manualmente e rode de novo."
  fi
}

push_branch() {
  local branch="$1"
  (( HAS_REMOTE )) || { warn "sem remote: push de '$branch' ignorado."; return 0; }
  run git push -u "$REMOTE" "$branch"
  ok "$branch enviada para $REMOTE"
}

# ---------------------------------------------------------------------- plano

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
DIRTY=0
git diff --quiet && git diff --cached --quiet || DIRTY=1
# Arquivos novos ainda não rastreados também contam como alteração.
[[ -n "$(git ls-files --others --exclude-standard)" ]] && DIRTY=1

echo
log "Plano de deploy"
printf '  repo .......: %s\n' "$REPO_ROOT"
printf '  branch atual: %s\n' "$CURRENT_BRANCH"
printf '  pipeline ...: %s\n' "$(printf '%s -> ' "${PIPELINE[@]}" | sed 's/ -> $//')"
printf '  remote .....: %s\n' "$( ((HAS_REMOTE)) && git remote get-url "$REMOTE" || echo '(nenhum)')"
printf '  build ......: %s\n' "$( ((RUN_BUILD)) && echo 'sim (npm run build)' || echo 'não')"
printf '  testes .....: %s\n' "$( ((RUN_TESTS)) && echo 'sim (npm run test:ui)' || echo 'não')"
printf '  alterações .: %s\n' "$( ((DIRTY)) && echo 'sim, serão commitadas' || echo 'árvore limpa')"
echo

if (( DIRTY )) && [[ -z "$MESSAGE" ]]; then
  die "há alterações não commitadas: passe a mensagem com -m \"sua mensagem\"."
fi

if (( ! ASSUME_YES )) && (( ! DRY_RUN )); then
  read -r -p "Confirmar deploy até '${PIPELINE[-1]}'? [y/N] " reply
  [[ "$reply" =~ ^[yYsS]$ ]] || die "cancelado."
fi

# ------------------------------------------------------------- build e testes

if (( RUN_BUILD || RUN_TESTS )); then
  command -v npm >/dev/null 2>&1 || die "npm não encontrado no PATH (use --no-build para pular)."
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "instalando dependências"
    if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
      run npm --prefix "$FRONTEND_DIR" ci
    else
      run npm --prefix "$FRONTEND_DIR" install
    fi
  fi
fi

if (( RUN_BUILD )); then
  log "validando build (vite build)"
  run npm --prefix "$FRONTEND_DIR" run build
  ok "build ok"
fi

if (( RUN_TESTS )); then
  log "rodando testes de UI"
  run npm --prefix "$FRONTEND_DIR" run test:ui
  ok "testes ok"
fi

# ------------------------------------------------------- commit na branch fonte

cd "$REPO_ROOT"

if [[ "$CURRENT_BRANCH" != "$SOURCE_BRANCH" ]]; then
  if (( DIRTY )); then
    # Leva as alterações pra branch de origem sem perder nada no caminho.
    log "movendo alterações de '$CURRENT_BRANCH' para '$SOURCE_BRANCH'"
    run git stash push -u -m "deploy.sh $(date +%FT%T)"
    switch_to "$SOURCE_BRANCH"
    run git stash pop || die "conflito ao aplicar o stash em '$SOURCE_BRANCH'. Resolva e rode de novo."
  else
    switch_to "$SOURCE_BRANCH"
  fi
else
  switch_to "$SOURCE_BRANCH"
fi

if (( DIRTY )); then
  log "commitando em '$SOURCE_BRANCH'"
  run git add -A
  run git commit -m "$MESSAGE"
  ok "commit criado"
else
  ok "nada para commitar em '$SOURCE_BRANCH'"
fi

push_branch "$SOURCE_BRANCH"

# --------------------------------------------------------------- promoção

# Anda de par em par: dev->qas, qas->main.
for (( i = 1; i < ${#PIPELINE[@]}; i++ )); do
  from="${PIPELINE[$((i - 1))]}"
  to="${PIPELINE[$i]}"

  log "promovendo $from -> $to"
  switch_to "$to"

  if run git merge --no-ff "$from" -m "chore(deploy): merge $from em $to"; then
    ok "merge $from -> $to ok"
  else
    run git merge --abort || true
    die "conflito no merge $from -> $to. Resolva manualmente ('git checkout $to && git merge $from') e rode de novo."
  fi

  push_branch "$to"
done

# ------------------------------------------------------------------ finalização

log "voltando para '$SOURCE_BRANCH'"
switch_to "$SOURCE_BRANCH"

echo
if (( DRY_RUN )); then
  ok "dry-run concluído — nenhuma alteração foi feita."
else
  ok "deploy concluído: $(printf '%s -> ' "${PIPELINE[@]}" | sed 's/ -> $//')"
fi
