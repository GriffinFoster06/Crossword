#!/usr/bin/env bash
set -e

BINARIES_DIR="$(dirname "$0")/../src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

OLLAMA_VERSION=$(curl -s https://api.github.com/repos/ollama/ollama/releases/latest | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-apple-darwin"
    DOWNLOAD_NAME="ollama-darwin"
  else
    TARGET="x86_64-apple-darwin"
    DOWNLOAD_NAME="ollama-darwin"
  fi
elif [ "$OS" = "Linux" ]; then
  TARGET="x86_64-unknown-linux-gnu"
  DOWNLOAD_NAME="ollama-linux-amd64"
else
  echo "Windows: download Ollama from https://ollama.com/download and place ollama.exe in src-tauri/binaries/ollama-x86_64-pc-windows-msvc.exe"
  exit 0
fi

DEST="$BINARIES_DIR/ollama-$TARGET"

if [ -f "$DEST" ]; then
  echo "Ollama binary already exists at $DEST, skipping download."
  exit 0
fi

echo "Downloading Ollama $OLLAMA_VERSION for $TARGET..."
curl -L "https://github.com/ollama/ollama/releases/download/$OLLAMA_VERSION/$DOWNLOAD_NAME" -o "$DEST"
chmod +x "$DEST"
echo "Done: $DEST"
