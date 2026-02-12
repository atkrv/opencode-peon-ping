#!/usr/bin/env bash
#
# install-pack.sh — Install sound packs from the OpenPeon registry
#
# Usage:
#   ./install-pack.sh <pack-name>     Install a pack by name
#   ./install-pack.sh --list          List available packs
#   ./install-pack.sh --installed     List installed packs
#
# Packs are installed to ~/.openpeon/packs/ per CESP v1.0 spec.
#

set -euo pipefail

REGISTRY_URL="https://peonping.github.io/registry/index.json"
PACKS_DIR="${HOME}/.openpeon/packs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
err()   { echo -e "${RED}[error]${NC} $*" >&2; }

# Check dependencies
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Required tool '$cmd' is not installed."
    exit 1
  fi
done

fetch_registry() {
  curl -fsSL "$REGISTRY_URL" 2>/dev/null
}

cmd_list() {
  info "Fetching registry from ${REGISTRY_URL}..."
  local registry
  registry=$(fetch_registry) || { err "Failed to fetch registry."; exit 1; }

  echo ""
  echo "Available packs:"
  echo "──────────────────────────────────────────────────────────"
  echo "$registry" | jq -r '
    .packs[] |
    "  \(.name)\t\(.display_name)\t(\(.language // "en"))\t\(.sound_count) sounds"
  ' | column -t -s $'\t'
  echo ""
  echo "Install with: ./install-pack.sh <pack-name>"
}

cmd_installed() {
  if [ ! -d "$PACKS_DIR" ]; then
    warn "No packs directory found at ${PACKS_DIR}"
    exit 0
  fi

  echo "Installed packs (${PACKS_DIR}):"
  echo "──────────────────────────────────────────────────────────"

  local found=0
  for dir in "$PACKS_DIR"/*/; do
    [ -d "$dir" ] || continue
    local name
    name=$(basename "$dir")

    local manifest=""
    if [ -f "${dir}openpeon.json" ]; then
      manifest="${dir}openpeon.json"
    elif [ -f "${dir}manifest.json" ]; then
      manifest="${dir}manifest.json"
    fi

    if [ -n "$manifest" ]; then
      local display
      display=$(jq -r '.display_name // .name // "?"' "$manifest" 2>/dev/null || echo "?")
      echo "  ${name}  ${display}"
      found=1
    fi
  done

  if [ "$found" -eq 0 ]; then
    warn "No packs installed."
  fi
}

cmd_install() {
  local pack_name="$1"

  info "Fetching registry..."
  local registry
  registry=$(fetch_registry) || { err "Failed to fetch registry."; exit 1; }

  # Find the pack in the registry
  local pack_info
  pack_info=$(echo "$registry" | jq -r --arg name "$pack_name" '.packs[] | select(.name == $name)')

  if [ -z "$pack_info" ]; then
    err "Pack '${pack_name}' not found in registry."
    echo ""
    echo "Run './install-pack.sh --list' to see available packs."
    exit 1
  fi

  local display_name source_repo source_ref source_path
  display_name=$(echo "$pack_info" | jq -r '.display_name')
  source_repo=$(echo "$pack_info" | jq -r '.source_repo')
  source_ref=$(echo "$pack_info" | jq -r '.source_ref')
  source_path=$(echo "$pack_info" | jq -r '.source_path')

  info "Installing ${display_name} (${pack_name})..."

  # Create packs directory
  mkdir -p "$PACKS_DIR"

  local dest="${PACKS_DIR}/${pack_name}"

  if [ -d "$dest" ]; then
    warn "Pack '${pack_name}' already installed at ${dest}"
    read -r -p "Reinstall? [y/N] " answer
    case "$answer" in
      [yY]*) rm -rf "$dest" ;;
      *)     info "Skipped."; exit 0 ;;
    esac
  fi

  # Download from GitHub using the tarball API
  local tarball_url="https://api.github.com/repos/${source_repo}/tarball/${source_ref}"

  info "Downloading from ${source_repo}@${source_ref}..."

  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '$tmpdir'" EXIT

  curl -fsSL "$tarball_url" | tar xz -C "$tmpdir" 2>/dev/null || {
    err "Failed to download pack from ${tarball_url}"
    exit 1
  }

  # The tarball extracts to a directory like owner-repo-sha/
  local extracted
  extracted=$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -1)

  if [ -z "$extracted" ]; then
    err "Failed to extract pack archive."
    exit 1
  fi

  # Copy the specific pack subdirectory
  local pack_src="${extracted}/${source_path}"
  if [ ! -d "$pack_src" ]; then
    err "Pack path '${source_path}' not found in archive."
    exit 1
  fi

  cp -r "$pack_src" "$dest"

  # Verify manifest exists
  if [ -f "${dest}/openpeon.json" ]; then
    ok "Installed ${display_name} to ${dest}"
    local categories
    categories=$(jq -r '.categories | keys | join(", ")' "${dest}/openpeon.json" 2>/dev/null || echo "?")
    info "Categories: ${categories}"
  elif [ -f "${dest}/manifest.json" ]; then
    ok "Installed ${display_name} to ${dest} (legacy format — will be auto-migrated)"
  else
    warn "Pack installed but no manifest found — may not work correctly."
  fi

  echo ""
  echo "To use this pack, set active_pack in your config:"
  echo "  ~/.config/opencode/peon-ping/config.json"
  echo ""
  echo "  { \"active_pack\": \"${pack_name}\" }"
}

# --- Main ---

case "${1:-}" in
  --list|-l)
    cmd_list
    ;;
  --installed|-i)
    cmd_installed
    ;;
  --help|-h|"")
    echo "Usage: ./install-pack.sh <pack-name>"
    echo "       ./install-pack.sh --list        List available packs"
    echo "       ./install-pack.sh --installed   List installed packs"
    echo ""
    echo "Installs OpenPeon CESP sound packs to ~/.openpeon/packs/"
    ;;
  *)
    cmd_install "$1"
    ;;
esac
