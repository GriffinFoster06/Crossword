use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;
use crate::ai::agents::clue_writer::{ClueWriterAgent, ClueCandidate};
use crate::ai::agents::theme_agent::{ThemeAgent, ThemeSuggestion};
use crate::ai::agents::word_selector::{WordSelectorAgent, RankedWord};
use crate::ai::agents::grid_constructor::{GridConstructorAgent, GridPattern, ThemeEntry};
use crate::ai::agents::overseer::{OverseerAgent, BatchClueResult, PuzzleRequest};

// CrossForge custom model definitions (embedded at compile time)
static CROSSFORGE_MODELS: &[(&str, &str)] = &[
    ("crossforge-clue-writer",    include_str!("../../../models/Modelfile.clue-writer")),
    ("crossforge-theme-agent",    include_str!("../../../models/Modelfile.theme-agent")),
    ("crossforge-word-selector",  include_str!("../../../models/Modelfile.word-selector")),
    ("crossforge-grid-constructor", include_str!("../../../models/Modelfile.grid-constructor")),
    ("crossforge-overseer",       include_str!("../../../models/Modelfile.overseer")),
];

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub available: bool,
    pub models: Vec<String>,
    pub selected_model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClueHistoryEntry {
    pub clue: String,
    pub source: String,
    pub year: Option<u16>,
    pub difficulty: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchClueInput {
    pub number: u16,
    pub direction: String,
    pub answer: String,
}

#[tauri::command]
pub async fn cmd_check_ollama() -> OllamaStatus {
    let client = OllamaClient::new(None);
    let available = client.is_available().await;

    if !available {
        return OllamaStatus {
            available: false,
            models: vec![],
            selected_model: None,
        };
    }

    let models = client
        .list_models()
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    let selected = client.best_available_model().await;

    OllamaStatus {
        available: true,
        models,
        selected_model: selected,
    }
}

#[tauri::command]
pub async fn cmd_generate_clues(
    answer: String,
    difficulty: u8,
    crossing_words: Vec<String>,
    theme_hint: Option<String>,
) -> Result<Vec<ClueCandidate>, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available. Install Ollama and pull a model.")?;

    let agent = ClueWriterAgent::new(client, model);
    agent
        .generate_clues(&answer, difficulty, &crossing_words, theme_hint.as_deref())
        .await
        .map_err(|e| format!("Clue generation failed: {}", e))
}

/// Generate clues for all words in a puzzle in one batch operation.
/// Emits "batch-clue-progress" events for each completed clue.
#[tauri::command]
pub async fn cmd_batch_generate_clues(
    words: Vec<BatchClueInput>,
    difficulty: u8,
    app_handle: tauri::AppHandle,
) -> Result<Vec<BatchClueResult>, String> {
    use tauri::Emitter;

    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let _agent = OverseerAgent::new(client.clone(), model.clone());
    let clue_agent = ClueWriterAgent::new(client, model);

    let mut results = Vec::new();
    let total = words.len();

    for (i, word_input) in words.iter().enumerate() {
        if word_input.answer.len() < 3 || word_input.answer.contains('_') {
            continue;
        }

        let candidates = clue_agent
            .generate_clues(&word_input.answer, difficulty, &[], None)
            .await
            .unwrap_or_default();

        let best = candidates.into_iter().next().unwrap_or(ClueCandidate {
            text: String::new(),
            style: String::new(),
            difficulty,
        });

        let result = BatchClueResult {
            number: word_input.number,
            direction: word_input.direction.clone(),
            answer: word_input.answer.clone(),
            clue: best.text.clone(),
            style: best.style.clone(),
        };

        let _ = app_handle.emit("batch-clue-progress", serde_json::json!({
            "index": i,
            "total": total,
            "result": &result,
        }));

        results.push(result);
    }

    Ok(results)
}

#[tauri::command]
pub async fn cmd_develop_theme(
    seed: String,
    grid_size: usize,
    difficulty: Option<String>,
) -> Result<ThemeSuggestion, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let agent = ThemeAgent::new(client, model);
    agent
        .develop_theme(&seed, grid_size, difficulty.as_deref())
        .await
        .map_err(|e| format!("Theme development failed: {}", e))
}

#[tauri::command]
pub async fn cmd_suggest_words(
    pattern: String,
    candidates: Vec<String>,
    crossing_context: Vec<String>,
    theme: Option<String>,
) -> Result<Vec<RankedWord>, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let agent = WordSelectorAgent::new(client, model);
    agent
        .rank_candidates(&pattern, &candidates, &crossing_context, theme.as_deref())
        .await
        .map_err(|e| format!("Word ranking failed: {}", e))
}

/// Construct a grid layout for given theme entries.
#[tauri::command]
pub async fn cmd_construct_grid(
    entries: Vec<serde_json::Value>,
    grid_size: usize,
    difficulty: Option<String>,
) -> Result<GridPattern, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let theme_entries: Vec<ThemeEntry> = entries
        .into_iter()
        .filter_map(|v| {
            let word = v["word"].as_str()?.to_uppercase();
            let length = word.len();
            let is_revealer = v["is_revealer"].as_bool().unwrap_or(false);
            Some(ThemeEntry { word, length, is_revealer })
        })
        .collect();

    let agent = GridConstructorAgent::new(client, model);
    agent
        .construct_grid(&theme_entries, grid_size, difficulty.as_deref())
        .await
        .map_err(|e| format!("Grid construction failed: {}", e))
}

/// Parse a natural language puzzle request into structured fields.
#[tauri::command]
pub async fn cmd_parse_puzzle_request(
    request: String,
) -> Result<PuzzleRequest, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let agent = OverseerAgent::new(client, model);
    agent
        .parse_request(&request)
        .await
        .map_err(|e| format!("Request parsing failed: {}", e))
}

/// Evaluate fill quality using the overseer agent.
#[tauri::command]
pub async fn cmd_evaluate_fill(
    words: Vec<String>,
    theme_entries: Vec<String>,
) -> Result<String, String> {
    let client = OllamaClient::new(None);

    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let agent = OverseerAgent::new(client, model);
    agent
        .evaluate_fill(&words, &theme_entries)
        .await
        .map_err(|e| format!("Fill evaluation failed: {}", e))
}

/// Stream a free-form AI response to the frontend via "ai-token" events.
/// Emits one event per token chunk, and a final "ai-stream-done" event when complete.
#[tauri::command]
pub async fn cmd_stream_ai_response(
    prompt: String,
    system: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Emitter;

    let client = OllamaClient::new(None);
    let model = client
        .best_available_model()
        .await
        .ok_or("No AI model available")?;

    let sys = system.unwrap_or_else(|| {
        "You are a helpful crossword construction assistant. \
         Be concise and focus on crossword-relevant answers.".to_string()
    });

    let handle = app_handle.clone();
    client
        .generate_streaming(&model, &sys, &prompt, 0.7, move |token| {
            let _ = handle.emit("ai-token", &token);
        })
        .await
        .map_err(|e| format!("Streaming failed: {}", e))?;

    let _ = app_handle.emit("ai-stream-done", ());
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInstallProgress {
    pub step: String,    // "checking" | "installing" | "done" | "skipped" | "error"
    pub model: String,
    pub index: usize,
    pub total: usize,
    pub message: String,
}

/// Returns which CrossForge models are present in Ollama.
#[tauri::command]
pub async fn cmd_check_crossforge_models() -> Vec<String> {
    let client = OllamaClient::new(None);
    if !client.is_available().await {
        return vec![];
    }
    let all = client.list_models().await.unwrap_or_default();
    let installed: Vec<String> = all.into_iter().map(|m| m.name).collect();

    CROSSFORGE_MODELS
        .iter()
        .filter(|(name, _)| installed.iter().any(|m| m.starts_with(name)))
        .map(|(name, _)| name.to_string())
        .collect()
}

/// Install all CrossForge Ollama models, emitting progress events.
/// Writes each Modelfile to a temp file, runs `ollama create`, then cleans up.
#[tauri::command]
pub async fn cmd_install_models(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;
    use std::process::Command;

    let client = OllamaClient::new(None);
    if !client.is_available().await {
        return Err("Ollama is not running. Start Ollama and try again.".to_string());
    }

    // Find which models are already installed
    let existing: Vec<String> = client
        .list_models()
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    let total = CROSSFORGE_MODELS.len();

    for (idx, (name, modelfile_content)) in CROSSFORGE_MODELS.iter().enumerate() {
        // Skip if already installed (exact name prefix match)
        if existing.iter().any(|m| m.starts_with(name)) {
            let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
                step: "skipped".to_string(),
                model: name.to_string(),
                index: idx,
                total,
                message: format!("{name} already installed"),
            });
            continue;
        }

        let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
            step: "installing".to_string(),
            model: name.to_string(),
            index: idx,
            total,
            message: format!("Creating {name}…"),
        });

        // Write Modelfile to a temp file
        let tmp_path = std::env::temp_dir().join(format!("crossforge-{name}.modelfile"));
        if let Err(e) = std::fs::write(&tmp_path, modelfile_content) {
            let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
                step: "error".to_string(),
                model: name.to_string(),
                index: idx,
                total,
                message: format!("Failed to write temp file: {e}"),
            });
            continue;
        }

        let result = Command::new("ollama")
            .args(["create", name, "-f", tmp_path.to_str().unwrap_or("")])
            .output();

        let _ = std::fs::remove_file(&tmp_path);

        match result {
            Ok(output) if output.status.success() => {
                let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
                    step: "done".to_string(),
                    model: name.to_string(),
                    index: idx,
                    total,
                    message: format!("{name} installed successfully"),
                });
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
                    step: "error".to_string(),
                    model: name.to_string(),
                    index: idx,
                    total,
                    message: format!("ollama create failed: {stderr}"),
                });
            }
            Err(e) => {
                let _ = app_handle.emit("model-install-progress", ModelInstallProgress {
                    step: "error".to_string(),
                    model: name.to_string(),
                    index: idx,
                    total,
                    message: format!("Failed to run ollama: {e}"),
                });
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn cmd_get_clue_history(
    word: String,
    _state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ClueHistoryEntry>, String> {
    let db_path = &_state.clue_db_path;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Clue DB error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT clue, source, year, difficulty FROM clues WHERE answer = ?1 ORDER BY year DESC LIMIT 20")
        .map_err(|e| format!("Query error: {}", e))?;

    let results = stmt
        .query_map([word.to_uppercase()], |row| {
            Ok(ClueHistoryEntry {
                clue: row.get(0)?,
                source: row.get(1)?,
                year: row.get(2)?,
                difficulty: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}
