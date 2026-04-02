#!/usr/bin/env bash
# CrossForge Model Installer
#
# Creates CrossForge's specialized Ollama models from Modelfiles.
# Run this after installing Ollama and pulling the base model (phi4).
#
# Usage:
#   bash scripts/install-models.sh                  # Install all models
#   bash scripts/install-models.sh clue-writer      # Install one model
#   bash scripts/install-models.sh --check          # Check status only
#   bash scripts/install-models.sh --remove         # Remove all CrossForge models

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_DIR="$PROJECT_DIR/models"
FINE_TUNED_DIR="$MODELS_DIR/fine-tuned"

# All CrossForge agent models
declare -A MODELS=(
    ["crossforge-clue-writer"]="Modelfile.clue-writer"
    ["crossforge-theme-agent"]="Modelfile.theme-agent"
    ["crossforge-word-selector"]="Modelfile.word-selector"
    ["crossforge-grid-constructor"]="Modelfile.grid-constructor"
    ["crossforge-overseer"]="Modelfile.overseer"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

check_ollama() {
    if ! command -v ollama &>/dev/null; then
        echo "ERROR: Ollama not found. Install from https://ollama.ai"
        exit 1
    fi
    if ! ollama list &>/dev/null; then
        echo "ERROR: Ollama is not running. Start it with: ollama serve"
        exit 1
    fi
}

model_exists() {
    local name="$1"
    ollama list 2>/dev/null | grep -q "^$name" || return 1
}

check_base_model() {
    # See if phi4 (or any good model) is available
    if ollama list 2>/dev/null | grep -qE "^phi4|^phi-4|^mistral|^llama3"; then
        return 0
    fi
    echo "WARNING: No preferred base model found (phi4, mistral, llama3)."
    echo "CrossForge AI agents will use whatever model is available."
    echo "For best results, install phi4:"
    echo "  ollama pull phi4"
    echo ""
}

# ── Actions ───────────────────────────────────────────────────────────────────

cmd_check() {
    echo "=== CrossForge Model Status ==="
    echo ""
    check_ollama
    echo "Available Ollama models:"
    ollama list
    echo ""
    echo "CrossForge model status:"
    for name in "${!MODELS[@]}"; do
        if model_exists "$name"; then
            echo "  ✓ $name"
        else
            echo "  ✗ $name (not installed)"
        fi
    done
    echo ""
    check_base_model
}

cmd_install_one() {
    local role="$1"  # e.g., "clue-writer"
    local name="crossforge-$role"
    local modelfile_name="${MODELS[$name]:-}"

    if [ -z "$modelfile_name" ]; then
        echo "Error: unknown model role: $role"
        echo "Available roles: ${!MODELS[*]}"
        exit 1
    fi

    # Check for fine-tuned GGUF first
    local gguf_path="$FINE_TUNED_DIR/$role/crossforge-$role.gguf"
    local modelfile_path="$MODELS_DIR/$modelfile_name"

    if [ -f "$gguf_path" ]; then
        echo "  Using fine-tuned model: $gguf_path"
        # Create temp Modelfile pointing to GGUF
        local tmp_mf
        tmp_mf="$(mktemp)"
        echo "FROM $gguf_path" > "$tmp_mf"
        # Append rest of Modelfile (skip FROM line)
        if [ -f "$modelfile_path" ]; then
            grep -v "^FROM" "$modelfile_path" >> "$tmp_mf" || true
        fi
        ollama create "$name" -f "$tmp_mf"
        rm -f "$tmp_mf"
    elif [ -f "$modelfile_path" ]; then
        echo "  Using base model Modelfile: $modelfile_path"
        ollama create "$name" -f "$modelfile_path"
    else
        echo "  Error: Modelfile not found: $modelfile_path"
        return 1
    fi

    echo "  ✓ Created: $name"
}

cmd_install_all() {
    echo "=== Installing CrossForge AI Models ==="
    echo ""
    check_ollama
    check_base_model

    local success=0
    local fail=0

    for name in "${!MODELS[@]}"; do
        role="${name#crossforge-}"
        echo "Installing $name..."
        if cmd_install_one "$role"; then
            success=$((success + 1))
        else
            fail=$((fail + 1))
        fi
        echo ""
    done

    echo "=== Done ==="
    echo "Installed: $success  Failed: $fail"
    echo ""
    echo "CrossForge AI features are ready. Launch the app and try:"
    echo "  - Clue Writer tab in the AI panel"
    echo "  - Theme Dev tab for theme suggestions"
    echo "  - Generate All Clues for batch clue writing"
}

cmd_remove() {
    echo "=== Removing CrossForge AI Models ==="
    check_ollama
    for name in "${!MODELS[@]}"; do
        if model_exists "$name"; then
            echo "  Removing $name..."
            ollama rm "$name" || true
        else
            echo "  Skipping $name (not installed)"
        fi
    done
    echo "Done."
}

# ── Entry point ───────────────────────────────────────────────────────────────

case "${1:-install}" in
    --check|check|status)
        cmd_check
        ;;
    --remove|remove|uninstall)
        cmd_remove
        ;;
    --help|help|-h)
        echo "Usage: $0 [check|install|remove|<role-name>]"
        echo ""
        echo "Commands:"
        echo "  (default)     Install all CrossForge models"
        echo "  check         Show model installation status"
        echo "  remove        Remove all CrossForge models from Ollama"
        echo "  clue-writer   Install only the clue writer model"
        echo "  theme-agent   Install only the theme agent model"
        echo "  word-selector Install only the word selector model"
        echo ""
        echo "Models installed:"
        for name in "${!MODELS[@]}"; do
            echo "  - $name"
        done
        ;;
    clue-writer|theme-agent|word-selector|grid-constructor|overseer)
        check_ollama
        cmd_install_one "$1"
        ;;
    install|all|"")
        cmd_install_all
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run: $0 --help"
        exit 1
        ;;
esac
