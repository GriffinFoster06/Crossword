/// Overseer AI Agent
///
/// Orchestrates end-to-end puzzle creation by coordinating specialized agents:
/// Theme Agent → Grid Constructor → Autofill → Clue Writer
///
/// The overseer manages the pipeline, validates each step, and synthesizes
/// a complete puzzle from a simple user request.

use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;
use crate::ai::agents::clue_writer::{ClueWriterAgent, ClueCandidate};

const SYSTEM_PROMPT: &str = r#"You are the overseer of a crossword construction system. Your job is to:
1. Understand the user's high-level request
2. Break it into actionable steps for specialized agents
3. Evaluate intermediate results and decide whether to proceed or retry
4. Synthesize a final quality assessment

When given a user request for a crossword puzzle, extract:
- Theme concept (what the puzzle is about)
- Desired difficulty (Mon-Sat or Sun)
- Any specific entries the user wants to include
- Any constraints or preferences

Output a JSON object:
{
  "theme_seed": "the core theme to develop",
  "difficulty": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
  "requested_entries": ["ENTRY1", "ENTRY2"],
  "grid_size": 15,
  "notes": "any other construction notes"
}

Be concise and accurate."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleRequest {
    pub theme_seed: String,
    pub difficulty: String,
    pub requested_entries: Vec<String>,
    pub grid_size: usize,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverseerProgress {
    pub step: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchClueResult {
    pub number: u16,
    pub direction: String,
    pub answer: String,
    pub clue: String,
    pub style: String,
}

pub struct OverseerAgent {
    client: OllamaClient,
    model: String,
}

impl OverseerAgent {
    pub fn new(client: OllamaClient, model: String) -> Self {
        Self { client, model }
    }

    /// Parse a natural language puzzle request into a structured PuzzleRequest.
    pub async fn parse_request(&self, user_request: &str) -> anyhow::Result<PuzzleRequest> {
        let prompt = format!(
            "Parse this crossword puzzle request:\n\n\"{}\"\n\nOutput a JSON object.",
            user_request
        );

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 0.3)
            .await?;

        let json_str = extract_json_object(&response);
        let req: PuzzleRequest = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| PuzzleRequest {
                theme_seed: user_request.to_string(),
                difficulty: "Wednesday".to_string(),
                requested_entries: vec![],
                grid_size: 15,
                notes: String::new(),
            });

        Ok(req)
    }

    /// Generate clues for all provided answers in a single batch operation.
    /// Returns one best clue per answer.
    pub async fn batch_generate_clues(
        &self,
        answers: &[(u16, String, String)], // (number, direction, answer)
        difficulty: u8,
    ) -> anyhow::Result<Vec<BatchClueResult>> {
        let clue_agent = ClueWriterAgent::new(self.client.clone(), self.model.clone());
        let mut results = Vec::new();

        for (number, direction, answer) in answers {
            if answer.len() < 3 || answer.contains('_') {
                continue;
            }

            let candidates = clue_agent
                .generate_clues(answer, difficulty, &[], None)
                .await
                .unwrap_or_else(|_| {
                    vec![ClueCandidate {
                        text: format!("See {}", answer),
                        style: "fallback".to_string(),
                        difficulty,
                    }]
                });

            let best = candidates.into_iter().next().unwrap_or(ClueCandidate {
                text: String::new(),
                style: String::new(),
                difficulty,
            });

            results.push(BatchClueResult {
                number: *number,
                direction: direction.clone(),
                answer: answer.clone(),
                clue: best.text,
                style: best.style,
            });
        }

        Ok(results)
    }

    /// Evaluate a completed fill for quality and coherence.
    pub async fn evaluate_fill(
        &self,
        words: &[String],
        theme_entries: &[String],
    ) -> anyhow::Result<String> {
        let eval_prompt = format!(
            "Evaluate this crossword fill for quality. Theme entries: {}\n\nAll words: {}\n\n\
            Comment on: freshness, crosswordese count, theme consistency, and overall quality. \
            Give a grade (A-F) and brief explanation in 2-3 sentences.",
            theme_entries.join(", "),
            words.join(", "),
        );

        let eval_system = "You are a crossword quality evaluator. Be concise and direct.";

        self.client
            .generate(&self.model, eval_system, &eval_prompt, 0.4)
            .await
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
