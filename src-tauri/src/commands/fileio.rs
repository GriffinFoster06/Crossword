use serde::Serialize;
use crate::formats::json::PuzzleFile;
use crate::formats::puz;
use crate::formats::pdf;
use crate::formats::nyt;
use crate::engine::validator::ValidationResult;

#[tauri::command]
pub fn cmd_save_puzzle(puzzle: PuzzleFile, path: String) -> Result<(), String> {
    puzzle
        .save_to_file(std::path::Path::new(&path))
        .map_err(|e| format!("Save failed: {}", e))
}

#[tauri::command]
pub fn cmd_load_puzzle(path: String) -> Result<PuzzleFile, String> {
    PuzzleFile::load_from_file(std::path::Path::new(&path))
        .map_err(|e| format!("Load failed: {}", e))
}

#[tauri::command]
pub fn cmd_export_puz(puzzle: PuzzleFile, path: String) -> Result<(), String> {
    let bytes = puz::export_puz(&puzzle).map_err(|e| format!("PUZ export failed: {}", e))?;
    std::fs::write(&path, bytes).map_err(|e| format!("Write failed: {}", e))
}

#[tauri::command]
pub fn cmd_import_puz(path: String) -> Result<PuzzleFile, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Read failed: {}", e))?;
    puz::import_puz(&data).map_err(|e| format!("PUZ import failed: {}", e))
}

#[tauri::command]
pub fn cmd_export_pdf(
    puzzle: PuzzleFile,
    path: String,
    include_solution: Option<bool>,
) -> Result<(), String> {
    let bytes = pdf::export_pdf(&puzzle, include_solution.unwrap_or(false))
        .map_err(|e| format!("PDF export failed: {}", e))?;
    std::fs::write(&path, bytes).map_err(|e| format!("Write failed: {}", e))
}

#[derive(Debug, Serialize)]
pub struct NytExportResult {
    pub puz_path: String,
    pub cover_letter: String,
    pub warnings: Vec<String>,
}

/// Validate and export puzzle as NYT submission package.
/// Writes the .puz file to `puz_path` and returns a cover letter + warnings.
#[tauri::command]
pub fn cmd_export_nyt(
    puzzle: PuzzleFile,
    puz_path: String,
    validation: ValidationResult,
) -> Result<NytExportResult, String> {
    match nyt::prepare_nyt_submission(&puzzle, &validation) {
        Ok(submission) => {
            std::fs::write(&puz_path, &submission.puz_bytes)
                .map_err(|e| format!("Write failed: {}", e))?;
            Ok(NytExportResult {
                puz_path,
                cover_letter: submission.cover_letter,
                warnings: submission.warnings,
            })
        }
        Err(e) => {
            let mut msg = format!("Puzzle not ready for submission:\n");
            for err in &e.errors {
                msg.push_str(&format!("  ✗ {}\n", err));
            }
            if !e.warnings.is_empty() {
                msg.push_str("Warnings:\n");
                for w in &e.warnings {
                    msg.push_str(&format!("  ⚠ {}\n", w));
                }
            }
            Err(msg)
        }
    }
}
