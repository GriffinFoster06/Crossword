/// Grid Constructor AI Agent
///
/// Given theme entries and puzzle type, suggests optimal black square patterns
/// that accommodate the theme entries while meeting NYT rules:
/// - 180° rotational symmetry
/// - All white cells connected
/// - Every white cell checked (in both Across and Down word)
/// - Word count limits
/// - Max ~16% black squares

use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;

const SYSTEM_PROMPT: &str = r#"You are an expert NYT crossword grid constructor. You design black square patterns for crossword grids.

NYT rules you must follow:
- 15x15 for daily puzzles, 21x21 for Sunday
- 180° rotational symmetry (if (r,c) is black, so is (N-1-r, N-1-c))
- Maximum ~36 black squares in a 15x15 (~16%)
- Every white cell must be in BOTH an Across and a Down word (no unchecked squares)
- All white cells must be connected (no isolated sections)
- No word shorter than 3 letters
- Themed weekdays: ≤78 words; themeless Fri/Sat: ≤72 words
- Theme entries are usually placed symmetrically

When asked to design a grid for theme entries, output:
1. A brief description of the grid pattern (stacked, diagonal, etc.)
2. A JSON object with:
   - "pattern": 2D array of 0 (white) and 1 (black) for the full grid
   - "theme_positions": array of {row, col, direction, word} for each theme entry
   - "word_count": estimated total word count
   - "black_count": number of black squares
   - "notes": any constructor notes

Only output valid JSON for the grid. The pattern must obey all NYT rules."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeEntry {
    pub word: String,
    pub length: usize,
    pub is_revealer: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemePosition {
    pub row: usize,
    pub col: usize,
    pub direction: String,
    pub word: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridPattern {
    pub pattern: Vec<Vec<u8>>,
    pub theme_positions: Vec<ThemePosition>,
    pub word_count: usize,
    pub black_count: usize,
    pub description: String,
    pub notes: String,
}

pub struct GridConstructorAgent {
    client: OllamaClient,
    model: String,
}

impl GridConstructorAgent {
    pub fn new(client: OllamaClient, model: String) -> Self {
        Self { client, model }
    }

    /// Design a grid layout that accommodates the given theme entries.
    pub async fn construct_grid(
        &self,
        theme_entries: &[ThemeEntry],
        grid_size: usize,
        difficulty: Option<&str>,
    ) -> anyhow::Result<GridPattern> {
        let entry_list: Vec<String> = theme_entries
            .iter()
            .map(|e| {
                if e.is_revealer {
                    format!("{} ({} letters, REVEALER)", e.word, e.length)
                } else {
                    format!("{} ({} letters)", e.word, e.length)
                }
            })
            .collect();

        let diff_note = difficulty
            .map(|d| format!("Difficulty: {} (affects black square density and word count)\n", d))
            .unwrap_or_default();

        let prompt = format!(
            "Design a {}×{} crossword grid for these theme entries:\n{}\n\n{}
Please create a grid pattern that:
1. Places theme entries symmetrically
2. Has a clean, elegant black square pattern
3. Maximizes interesting fill opportunities
4. Follows all NYT construction rules

Output the grid as a JSON object.",
            grid_size,
            grid_size,
            entry_list.join("\n"),
            diff_note,
        );

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 0.6)
            .await?;

        // Try to parse the JSON grid pattern
        let json_str = extract_json_object(&response);
        let pattern: serde_json::Value = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| serde_json::json!({
                "pattern": [],
                "theme_positions": [],
                "word_count": 0,
                "black_count": 0,
                "notes": response.trim()
            }));

        let grid_pattern = GridPattern {
            pattern: parse_pattern(&pattern["pattern"], grid_size),
            theme_positions: serde_json::from_value(pattern["theme_positions"].clone())
                .unwrap_or_default(),
            word_count: pattern["word_count"].as_u64().unwrap_or(0) as usize,
            black_count: pattern["black_count"].as_u64().unwrap_or(0) as usize,
            description: pattern["description"]
                .as_str()
                .unwrap_or("AI-generated grid pattern")
                .to_string(),
            notes: pattern["notes"].as_str().unwrap_or("").to_string(),
        };

        Ok(grid_pattern)
    }
}

fn parse_pattern(value: &serde_json::Value, size: usize) -> Vec<Vec<u8>> {
    if let Some(arr) = value.as_array() {
        let mut result = vec![vec![0u8; size]; size];
        for (r, row) in arr.iter().enumerate().take(size) {
            if let Some(row_arr) = row.as_array() {
                for (c, cell) in row_arr.iter().enumerate().take(size) {
                    if let Some(v) = cell.as_u64() {
                        result[r][c] = v as u8;
                    }
                }
            }
        }
        result
    } else {
        vec![vec![0u8; size]; size]
    }
}

fn extract_json_object(text: &str) -> String {
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return text[start..=end].to_string();
        }
    }
    text.to_string()
}
