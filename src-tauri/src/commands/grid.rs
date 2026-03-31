use crate::engine::grid::GridState;
use crate::engine::validator::{self, ValidationResult, GridStats};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct NumberingResult {
    pub cells: Vec<Vec<CellInfo>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CellInfo {
    pub number: Option<u16>,
    pub is_black: bool,
}

#[tauri::command]
pub fn cmd_compute_numbers(grid: GridState) -> NumberingResult {
    let mut working = grid;
    working.compute_numbers();

    let cells = working
        .cells
        .iter()
        .map(|row| {
            row.iter()
                .map(|c| CellInfo {
                    number: c.number,
                    is_black: c.is_black,
                })
                .collect()
        })
        .collect();

    NumberingResult { cells }
}

#[tauri::command]
pub fn cmd_toggle_black(
    mut grid: GridState,
    row: usize,
    col: usize,
    symmetric: bool,
) -> GridState {
    grid.toggle_black(row, col, symmetric);
    grid.compute_numbers();
    grid
}

#[tauri::command]
pub fn cmd_validate_grid(grid: GridState) -> ValidationResult {
    validator::validate(&grid)
}

#[tauri::command]
pub fn cmd_get_stats(grid: GridState) -> GridStats {
    validator::validate(&grid).stats
}
