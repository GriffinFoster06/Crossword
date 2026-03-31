use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;
use crate::ai::agents::clue_writer::{ClueWriterAgent, ClueCandidate};
use crate::ai::agents::theme_agent::{ThemeAgent, ThemeSuggestion};
use crate::ai::agents::word_selector::{WordSelectorAgent, RankedWord};

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
        .generate_clues(
            &answer,
            difficulty,
            &crossing_words,
            theme_hint.as_deref(),
        )
        .await
        .map_err(|e| format!("Clue generation failed: {}", e))
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
