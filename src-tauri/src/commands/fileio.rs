use crate::formats::json::PuzzleFile;
use crate::formats::puz;
use crate::formats::pdf;

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
