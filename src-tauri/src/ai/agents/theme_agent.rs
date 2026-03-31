/// Theme Development AI Agent
///
/// Identifies, develops, and suggests crossword themes including:
/// - Add-a-letter / Remove-a-letter
/// - Hidden words
/// - Rebuses
/// - Pun-based themes
/// - Cultural references
/// - Revealers

use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;

const SYSTEM_PROMPT: &str = r#"You are an expert NYT crossword theme developer. You create themes that are:
- Clever and satisfying to discover
- Consistent (all theme entries follow the same pattern)
- Appropriate for the specified day/difficulty
- Include a revealer answer when possible

Theme types you know:
- Add-a-letter: Each theme answer has an extra letter inserted
- Hidden words: A word is hidden inside each theme answer
- Rebuses: Multiple letters share one cell
- Puns/Wordplay: Answers are puns on a common phrase
- Category: All answers belong to a category with a twist
- Sound changes: Homophones or sound-alike transformations

When developing a theme, provide:
1. Theme description (1-2 sentences)
2. Theme type
3. 3-5 theme entries (long answers, 7+ letters) with explanations
4. A revealer answer and clue
5. Suggested grid positions for theme entries

Respond in JSON format:
{
  "description": "...",
  "type": "...",
  "entries": [
    {"answer": "THEMEENTRY", "explanation": "why this fits", "length": 10, "clue": "suggested clue"}
  ],
  "revealer": {"answer": "REVEALER", "clue": "clue for revealer", "explanation": "..."},
  "difficulty": "Monday-Saturday"
}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeEntry {
    pub answer: String,
    pub explanation: String,
    pub length: usize,
    pub clue: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeRevealer {
    pub answer: String,
    pub clue: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSuggestion {
    pub description: String,
    #[serde(rename = "type")]
    pub theme_type: String,
    pub entries: Vec<ThemeEntry>,
    pub revealer: Option<ThemeRevealer>,
    pub difficulty: String,
}

pub struct ThemeAgent {
    client: OllamaClient,
    model: String,
}

impl ThemeAgent {
    pub fn new(client: OllamaClient, model: String) -> Self {
        Self { client, model }
    }

    /// Develop a theme from a seed idea.
    pub async fn develop_theme(
        &self,
        seed: &str,
        grid_size: usize,
        difficulty: Option<&str>,
    ) -> anyhow::Result<ThemeSuggestion> {
        let diff = difficulty.unwrap_or("Wednesday");
        let num_entries = if grid_size >= 21 { "5-7" } else { "3-5" };

        let prompt = format!(
            "Develop a crossword theme based on this idea: \"{}\"\n\
             Grid size: {}×{}\n\
             Target difficulty: {}\n\
             Number of theme entries needed: {}\n\
             Theme entries should be common phrases or words (7-15 letters).\n\
             All entries must be real words/phrases that would appear in a crossword dictionary.\n\
             Respond with the JSON format specified.",
            seed, grid_size, grid_size, diff, num_entries,
        );

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 0.9)
            .await?;

        let json_str = extract_json_object(&response);
        let suggestion: ThemeSuggestion = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| ThemeSuggestion {
                description: response.trim().to_string(),
                theme_type: "unknown".to_string(),
                entries: vec![],
                revealer: None,
                difficulty: diff.to_string(),
            });

        Ok(suggestion)
    }

    /// Suggest multiple theme ideas from a broad concept.
    pub async fn brainstorm_themes(
        &self,
        concept: &str,
    ) -> anyhow::Result<Vec<ThemeSuggestion>> {
        let prompt = format!(
            "Brainstorm 3 different crossword theme ideas related to: \"{}\"\n\
             For each theme, provide a brief description, type, and 2-3 example entries.\n\
             Respond as a JSON array of theme objects.",
            concept,
        );

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 1.0)
            .await?;

        let json_str = extract_json_array(&response);
        let suggestions: Vec<ThemeSuggestion> = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| vec![ThemeSuggestion {
                description: response.trim().to_string(),
                theme_type: "brainstorm".to_string(),
                entries: vec![],
                revealer: None,
                difficulty: "Wednesday".to_string(),
            }]);

        Ok(suggestions)
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

fn extract_json_array(text: &str) -> String {
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return text[start..=end].to_string();
        }
    }
    text.to_string()
}
