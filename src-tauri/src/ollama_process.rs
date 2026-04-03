/// Manages the bundled Ollama sidecar process.
///
/// On startup, checks if Ollama is already running at localhost:11434.
/// If not, spawns the bundled sidecar binary and waits for it to be ready.
/// On app exit, kills the sidecar if we started it.

use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

pub type OllamaChild = Arc<Mutex<Option<CommandChild>>>;

/// Check if Ollama is already running on port 11434.
async fn is_ollama_reachable() -> bool {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default()
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .is_ok()
}

/// Ensure Ollama is running — either system-installed or the bundled sidecar.
/// Returns Ok if Ollama is ready to accept requests.
pub async fn ensure_ollama_running(
    app: &AppHandle,
    child_holder: &OllamaChild,
) -> Result<(), String> {
    // 1. Check if system Ollama or already-started sidecar is running
    if is_ollama_reachable().await {
        return Ok(());
    }

    // 2. Check if we already spawned the sidecar (in case this is called twice).
    // Extract the bool immediately so the MutexGuard is dropped before any await.
    let already_started = child_holder
        .lock()
        .map_err(|e| e.to_string())?
        .is_some();
    if already_started {
        return wait_for_ollama(15).await;
    }

    // 3. Spawn the bundled sidecar
    log::info!("System Ollama not found — starting bundled sidecar");
    let spawn_result = app
        .shell()
        .sidecar("ollama")
        .map_err(|e| format!("Ollama sidecar not found: {e}"))?
        .args(["serve"])
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {e}"));

    match spawn_result {
        Ok((mut rx, child)) => {
            // Store the child handle so we can kill it on exit
            {
                let mut guard = child_holder.lock().map_err(|e| e.to_string())?;
                *guard = Some(child);
            }
            // Drain process events in background (prevents blocking)
            tokio::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let tauri_plugin_shell::process::CommandEvent::Terminated(status) = event {
                        log::info!("Ollama sidecar exited with code {:?}", status.code);
                        break;
                    }
                }
            });
            wait_for_ollama(30).await
        }
        Err(e) => {
            // Sidecar binary not bundled (dev mode) — inform caller
            Err(format!(
                "Could not start Ollama: {e}. \
                 Please install Ollama from https://ollama.com and start it manually."
            ))
        }
    }
}

/// Wait for Ollama to accept connections, polling every 500ms.
async fn wait_for_ollama(max_attempts: u32) -> Result<(), String> {
    for _ in 0..max_attempts {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if is_ollama_reachable().await {
            return Ok(());
        }
    }
    Err(format!(
        "Ollama did not become ready after {}s. \
         Check that it started correctly.",
        max_attempts / 2
    ))
}

/// Kill the sidecar Ollama process if we started it.
/// Safe to call even if we didn't start it (no-op).
pub fn stop_ollama(child_holder: &OllamaChild) {
    if let Ok(mut guard) = child_holder.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
            log::info!("Bundled Ollama sidecar stopped");
        }
    }
}
