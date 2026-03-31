/// Clue Writer AI Agent
///
/// Generates crossword clues in various styles (straightforward, wordplay,
/// misdirection, pun) at configurable difficulty levels.

use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;

const SYSTEM_PROMPT: &str = r#"You are an expert NYT crossword clue writer. You write clues that are:
- Clever, concise, and fair to solvers
- Appropriate for the specified difficulty level (Monday=easiest, Saturday=hardest)
- Free of obscure trivia unless at Saturday difficulty
- Properly formatted (no abbreviations in clue unless answer is abbreviated)
- Varied in style: include straightforward definitions, wordplay, misdirection, and puns

When given an answer word and difficulty level, generate exactly 5 clue candidates.
Respond in JSON array format:
[
  {"text": "Clue text here", "style": "definition|wordplay|misdirection|pun|trivia", "difficulty": 1-6},
  ...
]

Rules:
- Monday (1): Straightforward definitions, common knowledge
- Tuesday (2): Slight twist or less common meaning
- Wednesday (3): Wordplay, mild misdirection
- Thursday (4): Trickier wordplay, less obvious meanings
- Friday (5): Vague, multi-meaning, clever
- Saturday (6): Maximum misdirection, very concise

The answer should NOT appear in the clue. Avoid "this", "it", or self-referential clues."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClueCandidate {
    pub text: String,
    pub style: String,
    pub difficulty: u8,
}

pub struct ClueWriterAgent {
    client: OllamaClient,
    model: String,
}

impl ClueWriterAgent {
    pub fn new(client: OllamaClient, model: String) -> Self {
        Self { client, model }
    }

    /// Generate clue candidates for an answer word.
    pub async fn generate_clues(
        &self,
        answer: &str,
        difficulty: u8, // 1=Monday to 6=Saturday
        crossing_words: &[String],
        theme_hint: Option<&str>,
    ) -> anyhow::Result<Vec<ClueCandidate>> {
        let difficulty_name = match difficulty {
            1 => "Monday",
            2 => "Tuesday",
            3 => "Wednesday",
            4 => "Thursday",
            5 => "Friday",
            _ => "Saturday",
        };

        let mut prompt = format!(
            "Generate 5 crossword clues for the answer: {}\nDifficulty: {} (level {})\n",
            answer.to_uppercase(),
            difficulty_name,
            difficulty,
        );

        if !crossing_words.is_empty() {
            prompt.push_str(&format!(
                "Context — crossing words in the grid: {}\n",
                crossing_words.join(", ")
            ));
        }

        if let Some(theme) = theme_hint {
            prompt.push_str(&format!("Theme context: {}\n", theme));
        }

        prompt.push_str("\nRespond with a JSON array of 5 clue objects.");

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 0.8)
            .await?;

        // Parse JSON from response (handle LLM sometimes wrapping in markdown)
        let json_str = extract_json_array(&response);
        let candidates: Vec<ClueCandidate> = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| {
                // Fallback: create a single candidate from the raw text
                vec![ClueCandidate {
                    text: response.trim().to_string(),
                    style: "generated".to_string(),
                    difficulty,
                }]
            });

        Ok(candidates)
    }
}

fn extract_json_array(text: &str) -> String {
    // Try to find JSON array in the response
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return text[start..=end].to_string();
        }
    }
    // Return the whole thing and let serde try
    text.to_string()
}
