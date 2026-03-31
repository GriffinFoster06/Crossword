/// CrossForge Fill Quality Scorer
///
/// Scores an autofill solution based on word quality, freshness, and theme fit.

use crate::engine::grid::WordSlot;
use crate::engine::worddb::WordDatabase;

pub struct FillScorer;

impl FillScorer {
    /// Score a completed grid. Returns 0.0–100.0.
    pub fn score_fill(slots: &[WordSlot], db: &WordDatabase) -> f32 {
        if slots.is_empty() {
            return 0.0;
        }

        let mut total_score: f32 = 0.0;
        let mut count = 0usize;

        for slot in slots {
            if slot.pattern.contains('_') {
                continue; // Incomplete word
            }
            let word_score = db.get_score(&slot.pattern).unwrap_or(40) as f32;
            total_score += word_score;
            count += 1;
        }

        if count == 0 { 0.0 } else { total_score / count as f32 }
    }

    /// Score a single word candidate in context.
    /// Higher = better choice for autofill.
    pub fn score_word_in_context(
        word: &str,
        base_score: u8,
        crossing_words: &[String],
        _is_theme: bool,
    ) -> f32 {
        let mut score = base_score as f32;

        // Penalize short words in a triple-stack context
        if word.len() < 5 && !crossing_words.is_empty() {
            score *= 0.85;
        }

        // Penalize common crosswordese
        if is_crosswordese(word) {
            score *= 0.6;
        }

        // Bonus for longer, lively words
        if word.len() >= 7 && base_score >= 60 {
            score *= 1.15;
        }

        score.min(100.0)
    }
}

fn is_crosswordese(word: &str) -> bool {
    const CROSSWORDESE: &[&str] = &[
        "EPEE", "ALEE", "ASEA", "ALOE", "ETUI", "ESNE", "SMEE", "OREO",
        "ENID", "EIRE", "ERIE", "ERNE", "ESAU", "EROS", "ARES", "ACER",
        "AEON", "IOTA", "OBOE", "ALEC", "ALTO", "ANTE", "ARIA", "ARIEL",
        "ARIL", "ARTOO", "ATOP", "ATTIC", "AVOW", "AWRY", "AXLE",
    ];
    CROSSWORDESE.contains(&word.to_uppercase().as_str())
}
