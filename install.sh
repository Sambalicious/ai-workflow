#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# install.sh — Install the AI startup team into any project
#
# Usage:
#   ./install.sh                         # install into current directory
#   ./install.sh /path/to/my-project     # install into a specific directory
#   ./install.sh --force                 # overwrite existing files
#   ./install.sh /path/to/project --force
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Resolve source (this repo's root) ─────────────────────────────────────────
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse arguments ────────────────────────────────────────────────────────────
TARGET_DIR="$(pwd)"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    *)          TARGET_DIR="$(cd "$arg" && pwd)" ;;
  esac
done

# ── Helpers ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()    { echo -e "${CYAN}[ai-workflow]${RESET} $*"; }
ok()     { echo -e "${GREEN}  ✓${RESET} $*"; }
skip()   { echo -e "${YELLOW}  ↷${RESET} $* (already exists — use --force to overwrite)"; }

copy_dir() {
  local src="$1"
  local dst="$2"

  if [[ "$FORCE" == true ]]; then
    mkdir -p "$dst"
    cp -rP "$src/." "$dst/"
    ok "$(basename "$dst")"
  elif [[ -d "$dst" ]]; then
    # Merge: only copy files/symlinks that don't already exist
    while IFS= read -r -d '' entry; do
      local rel="${entry#$src/}"
      local dest_entry="$dst/$rel"
      if [[ ! -e "$dest_entry" ]] && [[ ! -L "$dest_entry" ]]; then
        mkdir -p "$(dirname "$dest_entry")"
        cp -P "$entry" "$dest_entry"
        ok "$rel"
      else
        skip "$rel"
      fi
    done < <(find "$src" \( -type f -o -type l \) -print0)
  else
    cp -rP "$src" "$dst"
    ok "$(basename "$dst")"
  fi
}

copy_file() {
  local src="$1"
  local dst="$2"
  local label="${3:-$(basename "$src")}"

  if [[ -f "$dst" ]] && [[ "$FORCE" == false ]]; then
    skip "$label"
  else
    cp "$src" "$dst"
    ok "$label"
  fi
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
log "Installing AI startup team into: $TARGET_DIR"
echo ""

# ── Validate target ────────────────────────────────────────────────────────────
if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Error: target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi

if [[ "$TARGET_DIR" == "$SOURCE_DIR" ]]; then
  echo "Error: target is the same as source — choose a different project directory." >&2
  exit 1
fi

# ── 1. Copy .agents/ (agent definitions + skills + rules) ─────────────────────
log "Copying agent definitions (.agents/)..."
copy_dir "$SOURCE_DIR/.agents" "$TARGET_DIR/.agents"

# ── 2. Copy .claude/ (Claude Code agent symlinks + skills) ────────────────────
log "Copying Claude Code config (.claude/)..."
mkdir -p "$TARGET_DIR/.claude/agents"
mkdir -p "$TARGET_DIR/.claude/skills"

copy_dir "$SOURCE_DIR/.claude/agents" "$TARGET_DIR/.claude/agents"
copy_dir "$SOURCE_DIR/.claude/skills" "$TARGET_DIR/.claude/skills"
mkdir -p "$TARGET_DIR/.claude/commands"
copy_dir "$SOURCE_DIR/.claude/commands" "$TARGET_DIR/.claude/commands"

# ── 2b. Copy Kilo / OpenCode slash commands (.kilo/command/) ──────────────────
log "Copying Kilo commands (.kilo/command/)..."
mkdir -p "$TARGET_DIR/.kilo/command"
copy_dir "$SOURCE_DIR/.kilo/command" "$TARGET_DIR/.kilo/command"

# ── 3. Copy controller and pipeline orchestrator ──────────────────────────────
log "Copying bounded factory controller (factory/)..."
copy_dir "$SOURCE_DIR/factory" "$TARGET_DIR/factory"
log "Copying pipeline orchestrator (AGENTS.md)..."
copy_file "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"

# ── 3b. Copy model tiers, subagents and the sync script ───────────────────────
# .agents/ (models.json, agents/, reference/, benchmarks/) came with step 1. The
# generated client files live outside it; copy them only when missing so a project's
# own model choices and settings are kept. Edit .agents/models.json, then run
# `node scripts/agents/sync.mjs` to regenerate them.
log "Copying model tiers and subagent sync (scripts/agents/, .opencode/agents/)..."
mkdir -p "$TARGET_DIR/scripts"
copy_dir "$SOURCE_DIR/scripts/agents" "$TARGET_DIR/scripts/agents"
mkdir -p "$TARGET_DIR/.opencode"
copy_dir "$SOURCE_DIR/.opencode/agents" "$TARGET_DIR/.opencode/agents"
copy_file "$SOURCE_DIR/opencode.json" "$TARGET_DIR/opencode.json"
copy_file "$SOURCE_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json" ".claude/settings.json"

# ── 3b. Copy agent tooling and record the factory commit ──────────────────────
log "Copying agent tooling (scripts/agents/)..."
copy_dir "$SOURCE_DIR/scripts/agents" "$TARGET_DIR/scripts/agents"
if git -C "$SOURCE_DIR" rev-parse HEAD >/dev/null 2>&1; then
  mkdir -p "$TARGET_DIR/.agents"
  git -C "$SOURCE_DIR" rev-parse HEAD > "$TARGET_DIR/.agents/factory-version"
  ok "Recorded the factory commit in .agents/factory-version"
fi

# ── 4. Copy third-party skill lock (lets `npx skills update` refresh them) ────
log "Copying third-party skill lock (skills-lock.json)..."
copy_file "$SOURCE_DIR/skills-lock.json" "$TARGET_DIR/skills-lock.json"

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
log "Done! Your project now has the full AI startup team."
echo ""
echo "  Next steps:"
echo "    • Claude Code   — open $TARGET_DIR, use @agent-name in chat"
echo "    • Cursor        — copy .agents/<name>.md into .cursor/rules/<name>.mdc"
echo "    • Claude.ai     — paste any .agents/<name>.md as a system prompt"
echo "    • Full pipeline — invoke AGENTS.md with your idea"
echo "    • Repair loop   — read .agents/skills/factory-loop/SKILL.md"
echo "    • Controller    — node factory/cli.mjs --help"
echo "    • Model tiers   — edit .agents/models.json, then node scripts/agents/sync.mjs (add \"agents:sync\" and \"agents:check\" scripts and a CI step if you use them)"
echo "    • Skill refresh — node scripts/agents/sync-skills.mjs $TARGET_DIR (re-run after a factory skill changes)"
echo "    • Overnight     — /overnight in Kilo or Claude Code, or read .agents/commands/overnight.md"
echo ""
