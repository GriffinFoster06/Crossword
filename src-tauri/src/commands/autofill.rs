use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
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

    let requested_score = options.as_ref().and_then(|o| o.min_word_score).unwrap_or(30);
    let timeout = options.as_ref().and_then(|o| o.timeout_secs).unwrap_or(15);

    // Quality threshold relaxation: retry with progressively lower scores until fill succeeds
    let score_thresholds: Vec<u8> = {
        let mut thresholds = vec![];
        let mut s = requested_score;
        loop {
            thresholds.push(s);
            if s <= 10 { break; }
            s = s.saturating_sub(10);
        }
        thresholds
    };

    let mut final_result = AutofillResult {
        success: false,
        grid: None,
        quality_score: 0.0,
        words_placed: vec![],
        message: "Autofill failed".to_string(),
    };

    for (attempt, &min_score) in score_thresholds.iter().enumerate() {
        cancel.store(false, Ordering::Relaxed);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

        let handle2 = app_handle.clone();
        tokio::spawn(async move {
            while let Some(progress) = rx.recv().await {
                let _ = handle2.emit("autofill-progress", &progress);
            }
        });

        let grid_clone = grid.clone();
        let db_clone = db.clone();
        let cancel_clone = cancel.clone();

        let result = tokio::task::spawn_blocking(move || {
            let mut solver = Solver::new(&grid_clone, db_clone, cancel_clone, Some(tx), min_score, timeout);
            solver.solve()
        })
        .await
        .map_err(|e| format!("Autofill task failed: {}", e))?;

        let was_cancelled = cancel.load(Ordering::Relaxed);

        if result.success {
            let mut r = result;
            if attempt > 0 {
                r.message = format!("Fill complete (relaxed min score to {})", min_score);
            }
            final_result = r;
            break;
        }

        final_result = result;

        if was_cancelled {
            final_result.message = "Autofill cancelled".to_string();
            break;
        }
    }

    Ok(final_result)
}

#[tauri::command]
pub fn cmd_cancel_autofill() {
    let cancel = get_cancel_flag();
    cancel.store(true, Ordering::Relaxed);
}
