use tauri::State;
use crate::AppState;
use crate::engine::worddb::WordMatch;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WordInfo {
    pub word: String,
    pub score: u8,
    pub exists: bool,
}

#[tauri::command]
pub fn cmd_query_words(
    pattern: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Vec<WordMatch> {
    let limit = limit.unwrap_or(100);
    state.word_db.find_matches(&pattern, limit)
}

#[tauri::command]
pub fn cmd_get_word_count(state: State<'_, AppState>) -> usize {
    state.word_db.len()
}

#[tauri::command]
pub fn cmd_get_word_info(word: String, state: State<'_, AppState>) -> WordInfo {
    let exists = state.word_db.word_exists(&word);
    let score = state.word_db.get_score(&word).unwrap_or(0);
    WordInfo {
        word: word.to_uppercase(),
        score,
        exists,
    }
}
