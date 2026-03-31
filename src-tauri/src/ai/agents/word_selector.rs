/// Word Selection AI Agent
///
/// Re-ranks autofill candidates based on quality, freshness,
/// cultural relevance, and theme fit.

use serde::{Serialize, Deserialize};
use crate::ai::ollama_client::OllamaClient;

const SYSTEM_PROMPT: &str = r#"You are a crossword word quality expert. When given a list of candidate words for a crossword slot, you re-rank them based on:

1. **Liveliness**: Fun, interesting words score higher (PIZZAZZ > ASSESS)
2. **Modernity**: Current, relevant terms score higher (STREAMING > CASSETTE)
3. **Freshness**: Words not overused in crosswords score higher
4. **Crosswordese penalty**: Overused short fill (EPEE, ALEE, ASEA) scores lower
5. **Theme fit**: Words matching the puzzle theme score higher
6. **Cultural sensitivity**: Avoid potentially offensive entries

Given a slot pattern, list of candidates, and context, return a re-ranked JSON array:
[
  {"word": "EXAMPLE", "score": 85, "reason": "why this ranks here"}
]

Only return the top 10 candidates."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedWord {
    pub word: String,
    pub score: u8,
    pub reason: String,
}

pub struct WordSelectorAgent {
    client: OllamaClient,
    model: String,
}

impl WordSelectorAgent {
    pub fn new(client: OllamaClient, model: String) -> Self {
        Self { client, model }
    }

    /// Re-rank word candidates for a slot.
    pub async fn rank_candidates(
        &self,
        pattern: &str,
        candidates: &[String],
        crossing_context: &[String],
        theme: Option<&str>,
    ) -> anyhow::Result<Vec<RankedWord>> {
        let top_candidates: Vec<&str> = candidates.iter().take(20).map(|s| s.as_str()).collect();

        let mut prompt = format!(
            "Re-rank these crossword fill candidates for the pattern '{}':\n{}\n",
            pattern,
            top_candidates.join(", "),
        );

        if !crossing_context.is_empty() {
            prompt.push_str(&format!(
                "Crossing words already placed: {}\n",
                crossing_context.join(", ")
            ));
        }

        if let Some(theme) = theme {
            prompt.push_str(&format!("Puzzle theme: {}\n", theme));
        }

        prompt.push_str("Return the top 10 as a JSON array.");

        let response = self.client
            .generate(&self.model, SYSTEM_PROMPT, &prompt, 0.5)
            .await?;

        let json_str = extract_json_array(&response);
        let ranked: Vec<RankedWord> = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| {
                candidates.iter().take(10).enumerate().map(|(i, w)| RankedWord {
                    word: w.clone(),
                    score: (90 - i * 5) as u8,
                    reason: "database score".to_string(),
                }).collect()
            });

        Ok(ranked)
    }
}

fn extract_json_array(text: &str) -> String {
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return text[start..=end].to_string();
        }
    }
    text.to_string()
}
