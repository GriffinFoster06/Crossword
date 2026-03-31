use std::sync::{Arc, atomic::AtomicBool};
use tauri::{State, AppHandle, Emitter};
use crate::AppState;
use crate::engine::grid::GridState;
use crate::engine::solver::{Solver, AutofillResult};
use serde::{Serialize, Deserialize};

/// Global cancellation flag for autofill
static CANCEL_FLAG: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

fn get_cancel_flag() -> Arc<AtomicBool> {
    CANCEL_FLAG.get_or_init(|| Arc::new(AtomicBool::new(false))).clone()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AutofillOptions {
    pub min_word_score: Option<u8>,
    pub timeout_secs: Option<u64>,
}

#[tauri::command]
pub async fn cmd_start_autofill(
    grid: GridState,
    options: Option<AutofillOptions>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<AutofillResult, String> {
    let db = state.word_db.clone();
    let cancel = get_cancel_flag();
    cancel.store(false, std::sync::atomic::Ordering::Relaxed);

    let min_score = options.as_ref().and_then(|o| o.min_word_score).unwrap_or(30);
    let timeout = options.as_ref().and_then(|o| o.timeout_secs).unwrap_or(10);

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    // Forward progress events to the frontend
    let handle = app_handle.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = handle.emit("autofill-progress", &progress);
        }
    });

    // Run solver on a blocking thread
    let result = tokio::task::spawn_blocking(move || {
        let mut solver = Solver::new(&grid, db, cancel, Some(tx), min_score, timeout);
        solver.solve()
    })
    .await
    .map_err(|e| format!("Autofill task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub fn cmd_cancel_autofill() {
    let cancel = get_cancel_flag();
    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
}
