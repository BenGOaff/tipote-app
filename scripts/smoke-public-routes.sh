#!/usr/bin/env bash
# scripts/smoke-public-routes.sh
#
# Smoke tests sur les routes publiques critiques de Tipote. À lancer
# après chaque déploiement en prod (et idéalement en CI sur push).
# Détecte en moins de 30s les régressions les plus douloureuses :
#
#   - Iframe cassée : `X-Frame-Options` posé par erreur sur /q/ /p/ /pq/
#     (cf. PITFALLS section X — JB & co qui embarquent leurs quiz sur
#     leur blog ne peuvent plus charger l'iframe → casse silencieuse
#     pour TOUS les users qui embed).
#   - `Content-Security-Policy: frame-ancestors *` manquant sur les
#     mêmes routes (même conséquence).
#   - OG meta absent / mal calculé via buildCanonicalUrl (cf. PITFALLS
#     section K — iMessage / WhatsApp / Slack affichent `app.tipote.com`
#     même sur custom domain).
#   - Status non-200 sur une route publique active.
#
# Conventions :
#   - Exit code 0 si tout passe, 1 sinon.
#   - Sortie lisible : ✓ ou ✗ par check, résumé final.
#   - Aucune dépendance autre que `curl` et `grep`.
#
# Usage :
#   BASE_URL=https://app.tipote.com \
#   SMOKE_QUIZ_ID=<slug-ou-uuid-d-un-quiz-actif> \
#   SMOKE_PAGE_SLUG=<slug-d-une-page-active> \
#   SMOKE_POPQUIZ_ID=<id-d-un-popquiz-actif> \
#     bash scripts/smoke-public-routes.sh
#
# Les 3 IDs cibles sont optionnels indépendamment : un test est SKIP
# (pas ÉCHEC) si son ID n'est pas fourni. Ainsi Béné peut tester juste
# /q/ si elle n'a pas de popquiz actif sous la main.

set -uo pipefail

BASE_URL="${BASE_URL:-https://app.tipote.com}"
SMOKE_QUIZ_ID="${SMOKE_QUIZ_ID:-}"
SMOKE_PAGE_SLUG="${SMOKE_PAGE_SLUG:-}"
SMOKE_POPQUIZ_ID="${SMOKE_POPQUIZ_ID:-}"

# Couleurs ANSI (désactivées si stdout n'est pas un TTY → propre en CI)
if [ -t 1 ]; then
  C_GREEN=$'\033[0;32m'
  C_RED=$'\033[0;31m'
  C_YELLOW=$'\033[0;33m'
  C_DIM=$'\033[0;90m'
  C_RESET=$'\033[0m'
else
  C_GREEN="" C_RED="" C_YELLOW="" C_DIM="" C_RESET=""
fi

PASS=0
FAIL=0
SKIP=0

ok() { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$1"; PASS=$((PASS + 1)); }
ko() { printf "  %s✗%s %s\n" "$C_RED" "$C_RESET" "$1"; FAIL=$((FAIL + 1)); }
sk() { printf "  %s—%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; SKIP=$((SKIP + 1)); }
section() { printf "\n%s%s%s\n" "$C_DIM" "$1" "$C_RESET"; }

# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

# fetch_headers <url> → écrit les headers sur stdout, status en sortie.
# Suit jusqu'à 3 redirections (custom domain → canonical, etc.).
fetch_headers() {
  curl -sIL --max-redirs 3 -A "Mozilla/5.0 (smoke-test)" "$1" 2>/dev/null
}

# fetch_body <url> → écrit le HTML sur stdout.
fetch_body() {
  curl -sL --max-redirs 3 -A "Mozilla/5.0 (smoke-test)" "$1" 2>/dev/null
}

# get_status <url> → écrit le dernier HTTP status (ex 200, 404…).
get_status() {
  curl -sIL --max-redirs 3 -o /dev/null -w "%{http_code}" -A "Mozilla/5.0 (smoke-test)" "$1" 2>/dev/null
}

# Cherche un header (case-insensitive) dans la sortie de fetch_headers.
# Si plusieurs réponses (suivi de redirect), prend la DERNIÈRE occurrence.
extract_last_header() {
  local headers="$1" name="$2"
  echo "$headers" | grep -Ei "^${name}:" | tail -1 | sed -E "s/^[^:]+:[[:space:]]*//I" | tr -d '\r'
}

# ─────────────────────────────────────────────────────────────────────
# Tests communs à toute route publique embeddable
# ─────────────────────────────────────────────────────────────────────

check_embeddable_route() {
  local label="$1" url="$2"

  section "${label} → ${url}"

  local status
  status=$(get_status "$url")
  if [ "$status" = "200" ]; then
    ok "status 200"
  else
    ko "status attendu 200, obtenu ${status}"
    return
  fi

  local headers
  headers=$(fetch_headers "$url")

  # Critique : X-Frame-Options ne doit PAS être posé (cf. PITFALLS X)
  local xfo
  xfo=$(extract_last_header "$headers" "X-Frame-Options")
  if [ -z "$xfo" ]; then
    ok "pas de X-Frame-Options (iframe permise)"
  else
    ko "X-Frame-Options présent: ${xfo} → iframe CASSÉE chez les users qui embed"
  fi

  # Critique : CSP frame-ancestors * (autorise embed)
  local csp
  csp=$(extract_last_header "$headers" "Content-Security-Policy")
  if echo "$csp" | grep -qiE 'frame-ancestors[[:space:]]+\*'; then
    ok "CSP frame-ancestors *"
  elif [ -z "$csp" ]; then
    ko "Content-Security-Policy absent → embed non autorisé par défaut"
  else
    ko "CSP présent mais frame-ancestors manquant ou restrictif → embed cassé"
  fi

  # OG meta : og:url + og:title + og:image attendus pour un partage propre
  local body
  body=$(fetch_body "$url")

  if echo "$body" | grep -qiE '<meta[^>]+property="og:title"'; then
    ok "og:title présent"
  else
    ko "og:title absent → preview iMessage/WhatsApp/Slack dégradé"
  fi

  if echo "$body" | grep -qiE '<meta[^>]+property="og:url"'; then
    # Si custom domain dans l'URL, og:url doit aussi pointer sur le
    # custom domain (cf. PITFALLS K). On vérifie qu'au moins l'host
    # n'est pas app.tipote.com quand l'URL ne l'est pas.
    local og_url
    og_url=$(echo "$body" | grep -oiE '<meta[^>]+property="og:url"[^>]+content="[^"]+"' | head -1 | sed -E 's/.*content="([^"]+)".*/\1/')
    local req_host
    req_host=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
    local og_host
    og_host=$(echo "$og_url" | sed -E 's|https?://([^/]+).*|\1|')
    if [ "$req_host" = "$og_host" ]; then
      ok "og:url cohérent (${og_host})"
    else
      ko "og:url=${og_host} ≠ host requêté ${req_host} (cf. PITFALLS K)"
    fi
  else
    ko "og:url absent → preview affiche metadataBase au lieu du custom domain"
  fi

  # canonical lien : on accepte HTML rel="canonical" OU header Link
  if echo "$body" | grep -qiE '<link[^>]+rel="canonical"'; then
    ok "<link rel=canonical> présent"
  else
    sk "<link rel=canonical> absent (vérifier alternates côté Next)"
  fi
}

# ─────────────────────────────────────────────────────────────────────
# Suite
# ─────────────────────────────────────────────────────────────────────

printf "%sSmoke tests routes publiques Tipote%s\n" "$C_DIM" "$C_RESET"
printf "%s  base : ${BASE_URL}%s\n" "$C_DIM" "$C_RESET"

# Quiz public
if [ -n "$SMOKE_QUIZ_ID" ]; then
  check_embeddable_route "Quiz public /q/" "${BASE_URL}/q/${SMOKE_QUIZ_ID}"
else
  section "Quiz public /q/ → SKIP (SMOKE_QUIZ_ID non fourni)"
fi

# Page publique
if [ -n "$SMOKE_PAGE_SLUG" ]; then
  check_embeddable_route "Page publique /p/" "${BASE_URL}/p/${SMOKE_PAGE_SLUG}"
else
  section "Page publique /p/ → SKIP (SMOKE_PAGE_SLUG non fourni)"
fi

# Popquiz public
if [ -n "$SMOKE_POPQUIZ_ID" ]; then
  check_embeddable_route "Popquiz public /pq/" "${BASE_URL}/pq/${SMOKE_POPQUIZ_ID}"
else
  section "Popquiz public /pq/ → SKIP (SMOKE_POPQUIZ_ID non fourni)"
fi

# Routes infra non-embed mais critiques
section "Infra"
robots_status=$(get_status "${BASE_URL}/robots.txt")
if [ "$robots_status" = "200" ]; then ok "robots.txt"; else ko "robots.txt status ${robots_status}"; fi
sitemap_status=$(get_status "${BASE_URL}/sitemap.xml")
if [ "$sitemap_status" = "200" ]; then ok "sitemap.xml"; else ko "sitemap.xml status ${sitemap_status}"; fi
favicon_status=$(get_status "${BASE_URL}/favicon.ico")
if [ "$favicon_status" = "200" ] || [ "$favicon_status" = "304" ]; then
  ok "favicon.ico"
else
  ko "favicon.ico status ${favicon_status}"
fi

# ─────────────────────────────────────────────────────────────────────
# Résumé
# ─────────────────────────────────────────────────────────────────────

printf "\n"
TOTAL=$((PASS + FAIL + SKIP))
if [ "$FAIL" -eq 0 ]; then
  printf "%s✓ %d/%d checks OK%s (%d skip)\n" "$C_GREEN" "$PASS" "$TOTAL" "$C_RESET" "$SKIP"
  exit 0
else
  printf "%s✗ %d/%d checks en échec%s (%d ok, %d skip)\n" "$C_RED" "$FAIL" "$TOTAL" "$C_RESET" "$PASS" "$SKIP"
  exit 1
fi
