/// NYT Submission format support for CrossForge.
///
/// Validates and prepares a puzzle for NYT submission:
/// - Verifies all NYT rules pass (via validator)
/// - Ensures all clues are filled
/// - Generates a .puz file (standard submission format)
/// - Generates a plain-text cover letter template
/// - Returns structured validation errors if the puzzle is not ready

use crate::engine::validator::ValidationResult;
use crate::formats::json::PuzzleFile;
use crate::formats::puz::export_puz;

/// The result of a NYT submission preparation.
#[derive(Debug)]
pub struct NytSubmission {
    /// The .puz binary ready for email attachment.
    pub puz_bytes: Vec<u8>,
    /// A plain-text cover letter template (fill in personal details).
    pub cover_letter: String,
    /// Any warnings (non-blocking).
    pub warnings: Vec<String>,
}

#[derive(Debug)]
pub struct SubmissionError {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl std::fmt::Display for SubmissionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Submission not ready: {}", self.errors.join("; "))
    }
}
impl std::error::Error for SubmissionError {}

/// Validate and prepare a puzzle for NYT submission.
pub fn prepare_nyt_submission(
    puzzle: &PuzzleFile,
    validation: &ValidationResult,
) -> Result<NytSubmission, SubmissionError> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // ── Structural validation ─────────────────────────────────────────────
    if !validation.is_valid {
        for v in &validation.violations {
            errors.push(format!("[{}] {}", v.rule, v.message));
        }
    }

    // ── Metadata checks ───────────────────────────────────────────────────
    if puzzle.metadata.title.trim().is_empty() {
        errors.push("Title is required for NYT submission".into());
    }
    if puzzle.metadata.author.trim().is_empty() {
        errors.push("Author name is required for NYT submission".into());
    }

    // ── Clue completeness ─────────────────────────────────────────────────
    let empty_across: Vec<u16> = puzzle.clues.across.iter()
        .filter(|c| c.text.trim().is_empty())
        .map(|c| c.number)
        .collect();
    let empty_down: Vec<u16> = puzzle.clues.down.iter()
        .filter(|c| c.text.trim().is_empty())
        .map(|c| c.number)
        .collect();

    if !empty_across.is_empty() {
        let nums: Vec<String> = empty_across.iter().map(|n| n.to_string()).collect();
        errors.push(format!("Missing Across clues for: {}", nums.join(", ")));
    }
    if !empty_down.is_empty() {
        let nums: Vec<String> = empty_down.iter().map(|n| n.to_string()).collect();
        errors.push(format!("Missing Down clues for: {}", nums.join(", ")));
    }

    // ── Grid fill check ───────────────────────────────────────────────────
    let unfilled: usize = puzzle.grid.cells.iter()
        .flat_map(|row| row.iter())
        .filter(|c| !c.is_black && c.letter.is_none() && c.rebus.is_none())
        .count();
    if unfilled > 0 {
        errors.push(format!("{} white cells are unfilled", unfilled));
    }

    // ── Warnings (non-blocking) ───────────────────────────────────────────
    if puzzle.metadata.difficulty.is_none() {
        warnings.push("Consider specifying a difficulty level (Monday–Saturday)".into());
    }
    if puzzle.metadata.editor.trim().is_empty() {
        warnings.push("Editor field is empty (Will Shortz for NYT)".into());
    }
    if puzzle.metadata.copyright.trim().is_empty() {
        warnings.push("Copyright field is empty".into());
    }

    // Word count advisory
    let word_count = puzzle.clues.across.len() + puzzle.clues.down.len();
    let size = puzzle.grid.size;
    let max_words = if size == 21 { 140 } else { 78 };
    if word_count > max_words {
        warnings.push(format!(
            "Word count {} exceeds NYT maximum of {} for {}×{} grid",
            word_count, max_words, size, size
        ));
    }

    // Clue length advisory
    for c in puzzle.clues.across.iter().chain(puzzle.clues.down.iter()) {
        if c.text.len() > 150 {
            warnings.push(format!("Clue {}: unusually long ({} chars)", c.number, c.text.len()));
        }
    }

    if !errors.is_empty() {
        return Err(SubmissionError { errors, warnings });
    }

    // ── Build .puz bytes ──────────────────────────────────────────────────
    let puz_bytes = export_puz(puzzle).map_err(|e| SubmissionError {
        errors: vec![format!("Failed to generate .puz: {}", e)],
        warnings: warnings.clone(),
    })?;

    // ── Cover letter ──────────────────────────────────────────────────────
    let difficulty = puzzle.metadata.difficulty.as_deref().unwrap_or("TBD");
    let title = &puzzle.metadata.title;
    let author = &puzzle.metadata.author;
    let word_count_str = word_count.to_string();
    let black_count = puzzle.grid.cells.iter()
        .flat_map(|r| r.iter())
        .filter(|c| c.is_black)
        .count();

    let cover_letter = format!(
        r#"Dear Will,

Please find attached my {size}x{size} {difficulty} crossword puzzle, "{title}".

PUZZLE STATISTICS
  Title:       {title}
  Constructor: {author}
  Grid Size:   {size}×{size}
  Difficulty:  {difficulty}
  Word Count:  {word_count_str}
  Black Squares: {black_count}

THEME
  {theme_desc}

NOTES
  {notes}

The puzzle is attached as a .puz file compatible with Across Lite.

Thank you for your consideration.

Sincerely,
{author}

[Your address]
[Your email]
[Your phone]
"#,
        size = size,
        difficulty = difficulty,
        title = title,
        author = author,
        word_count_str = word_count_str,
        black_count = black_count,
        theme_desc = puzzle.theme.as_ref()
            .map(|t| t.description.as_str())
            .unwrap_or("[Describe your theme here]"),
        notes = puzzle.notes.as_deref().unwrap_or("[Any notes about the puzzle]"),
    );

    Ok(NytSubmission { puz_bytes, cover_letter, warnings })
}
