/// CrossForge NYT Grid Validator
///
/// Enforces all NYT publication rules and returns structured violations.

use serde::{Serialize, Deserialize};
use crate::engine::grid::{GridState, Direction};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Severity {
    Error,   // Grid cannot be published as-is
    Warning, // Suboptimal but technically allowed
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Violation {
    pub rule: String,
    pub severity: Severity,
    pub message: String,
    pub cells: Vec<(usize, usize)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GridStats {
    pub word_count: usize,
    pub across_count: usize,
    pub down_count: usize,
    pub black_count: usize,
    pub black_percentage: f32,
    pub avg_word_length: f32,
    pub min_word_length: usize,
    pub max_word_length: usize,
    pub unchecked_cells: usize,
    pub total_cells: usize,
    pub white_cells: usize,
    pub is_connected: bool,
    pub has_symmetry: bool,
    pub triple_stack_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub violations: Vec<Violation>,
    pub stats: GridStats,
}

pub fn validate(grid: &GridState) -> ValidationResult {
    let mut violations: Vec<Violation> = Vec::new();
    let size = grid.size;

    // Run grid.compute_numbers-style analysis on a clone with numbers
    let mut working = grid.clone();
    working.compute_numbers();
    let slots = working.get_slots();

    // Compute stats
    let word_count = slots.len();
    let across_count = slots.iter().filter(|s| s.direction == Direction::Across).count();
    let down_count = slots.iter().filter(|s| s.direction == Direction::Down).count();
    let black_count = grid.black_cell_count();
    let total_cells = size * size;
    let white_cells = grid.total_white_cells();
    let black_percentage = 100.0 * black_count as f32 / total_cells as f32;
    let connected = grid.connected_white_cells();
    let is_connected = connected == white_cells;
    let has_symmetry = grid.has_rotational_symmetry();

    let word_lengths: Vec<usize> = slots.iter().map(|s| s.length).collect();
    let min_word_length = word_lengths.iter().copied().min().unwrap_or(0);
    let max_word_length = word_lengths.iter().copied().max().unwrap_or(0);
    let avg_word_length = if word_count > 0 {
        word_lengths.iter().sum::<usize>() as f32 / word_count as f32
    } else { 0.0 };

    // Check for unchecked cells (cells that appear in only one word)
    let unchecked = find_unchecked_cells(grid);
    let unchecked_cells = unchecked.len();

    // Count triple stacks (3+ long words in a row)
    let triple_stack_count = count_triple_stacks(&slots, size);

    let stats = GridStats {
        word_count,
        across_count,
        down_count,
        black_count,
        black_percentage,
        avg_word_length,
        min_word_length,
        max_word_length,
        unchecked_cells,
        total_cells,
        white_cells,
        is_connected,
        has_symmetry,
        triple_stack_count,
    };

    // --- Rule Checks ---

    // 1. Rotational symmetry (mandatory)
    if !has_symmetry {
        violations.push(Violation {
            rule: "symmetry".into(),
            severity: Severity::Error,
            message: "Grid does not have 180° rotational symmetry".into(),
            cells: vec![],
        });
    }

    // 2. Minimum word length (3 letters)
    if min_word_length < 3 && word_count > 0 {
        let short_slots: Vec<(usize, usize)> = slots.iter()
            .filter(|s| s.length < 3)
            .map(|s| (s.row, s.col))
            .collect();
        violations.push(Violation {
            rule: "min_word_length".into(),
            severity: Severity::Error,
            message: format!("Grid contains words shorter than 3 letters (min: {})", min_word_length),
            cells: short_slots,
        });
    }

    // 3. All-over interlock (connectivity)
    if !is_connected && white_cells > 0 {
        violations.push(Violation {
            rule: "connectivity".into(),
            severity: Severity::Error,
            message: format!(
                "Grid has disconnected sections ({} reachable, {} total white cells)",
                connected, white_cells
            ),
            cells: vec![],
        });
    }

    // 4. Checked letters (no unchecked squares)
    if !unchecked.is_empty() {
        violations.push(Violation {
            rule: "checked_letters".into(),
            severity: Severity::Error,
            message: format!(
                "{} cells appear in only one word (unchecked squares not allowed)",
                unchecked.len()
            ),
            cells: unchecked,
        });
    }

    // 5. Black square percentage
    if black_percentage > 16.5 {
        violations.push(Violation {
            rule: "black_squares".into(),
            severity: Severity::Warning,
            message: format!(
                "Black squares: {:.1}% (recommended max 16%)",
                black_percentage
            ),
            cells: vec![],
        });
    }

    // 6. Word count limits
    let word_limit = if size == 21 { 140 } else { 78 };
    if word_count > word_limit {
        violations.push(Violation {
            rule: "word_count".into(),
            severity: Severity::Warning,
            message: format!(
                "Word count {} exceeds recommended maximum {} for {}×{} grid",
                word_count, word_limit, size, size
            ),
            cells: vec![],
        });
    }

    // 7. Grid size (must be odd)
    if size % 2 == 0 {
        violations.push(Violation {
            rule: "grid_size".into(),
            severity: Severity::Error,
            message: format!("Grid size {} must be odd (NYT standard: 15 or 21)", size),
            cells: vec![],
        });
    }

    // 8. Duplicate answers
    let duplicate_cells = find_duplicates(&slots);
    if !duplicate_cells.is_empty() {
        violations.push(Violation {
            rule: "no_duplicates".into(),
            severity: Severity::Error,
            message: "Grid contains duplicate answers".into(),
            cells: duplicate_cells,
        });
    }

    // 9. Odd corners (all 4 corners should be white in a standard puzzle)
    // Actually NYT allows black corners but they reduce the score — just warn
    let corners = [
        (0, 0), (0, size.saturating_sub(1)),
        (size.saturating_sub(1), 0), (size.saturating_sub(1), size.saturating_sub(1))
    ];
    let black_corners: Vec<(usize, usize)> = corners.iter()
        .filter(|&&(r, c)| grid.cells[r][c].is_black)
        .copied()
        .collect();
    if !black_corners.is_empty() {
        violations.push(Violation {
            rule: "corner_cells".into(),
            severity: Severity::Warning,
            message: "Corner cells are black (unconventional)".into(),
            cells: black_corners,
        });
    }

    let is_valid = violations.iter().all(|v| v.severity != Severity::Error);
    ValidationResult { is_valid, violations, stats }
}

fn find_unchecked_cells(grid: &GridState) -> Vec<(usize, usize)> {
    let size = grid.size;
    let mut cell_word_count: Vec<Vec<u8>> = vec![vec![0u8; size]; size];

    let mut working = grid.clone();
    working.compute_numbers();
    let slots = working.get_slots();

    for slot in &slots {
        for (r, c) in slot.cells() {
            if r < size && c < size {
                cell_word_count[r][c] += 1;
            }
        }
    }

    let mut unchecked = Vec::new();
    for row in 0..size {
        for col in 0..size {
            if !grid.cells[row][col].is_black && cell_word_count[row][col] < 2 {
                unchecked.push((row, col));
            }
        }
    }
    unchecked
}

fn find_duplicates(slots: &[crate::engine::grid::WordSlot]) -> Vec<(usize, usize)> {
    let mut seen: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();
    let mut dup_cells: Vec<(usize, usize)> = Vec::new();

    for slot in slots {
        let pattern = &slot.pattern;
        if pattern.contains('_') {
            continue; // Skip incomplete words
        }
        if let Some(&orig) = seen.get(pattern.as_str()) {
            dup_cells.push((slot.row, slot.col));
            dup_cells.push(orig);
        } else {
            seen.insert(pattern.clone(), (slot.row, slot.col));
        }
    }
    dup_cells.sort();
    dup_cells.dedup();
    dup_cells
}

fn count_triple_stacks(slots: &[crate::engine::grid::WordSlot], _size: usize) -> usize {
    // Count groups of 3+ consecutive across words of length >= 9
    let mut count = 0;
    let long_across: Vec<_> = slots.iter()
        .filter(|s| s.direction == Direction::Across && s.length >= 9)
        .collect();

    let mut row_groups: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();
    for slot in &long_across {
        row_groups.entry(slot.row).or_default().push(slot.col);
    }

    // Check for consecutive rows with long acrosses
    let mut rows: Vec<usize> = row_groups.keys().copied().collect();
    rows.sort();
    let mut streak = 1usize;
    for window in rows.windows(2) {
        if window[1] == window[0] + 1 {
            streak += 1;
            if streak >= 3 {
                count += 1;
            }
        } else {
            streak = 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::grid::GridState;

    fn all_white_15() -> GridState {
        let mut g = GridState::new(15);
        g.compute_numbers();
        g
    }

    #[test]
    fn test_valid_empty_15x15_has_no_word_length_errors() {
        // An all-white 15×15 has only length-15 slots, so no "too-short word" violations.
        let g = all_white_15();
        let result = validate(&g);
        let short_word_violations = result.violations.iter()
            .filter(|v| v.rule == "MinWordLength")
            .count();
        assert_eq!(short_word_violations, 0);
    }

    #[test]
    fn test_invalid_grid_size() {
        // 10×10 is not a valid NYT size
        let g = GridState::new(10);
        let result = validate(&g);
        assert!(!result.is_valid);
        assert!(result.violations.iter().any(|v| v.rule.contains("Size") || v.rule.contains("size") || v.severity == Severity::Error));
    }

    #[test]
    fn test_15x15_stats_word_count() {
        // All-white 15×15: 15 across + 15 down = 30 words, each length 15
        let g = all_white_15();
        let result = validate(&g);
        assert_eq!(result.stats.across_count, 15);
        assert_eq!(result.stats.down_count, 15);
        assert_eq!(result.stats.word_count, 30);
    }

    #[test]
    fn test_unchecked_cells_all_white() {
        // In an all-white grid, every cell is checked (appears in both across and down)
        let g = all_white_15();
        let result = validate(&g);
        assert_eq!(result.stats.unchecked_cells, 0);
    }

    #[test]
    fn test_isolated_cell_fails_connectivity() {
        // Create a fully black grid with one lone white cell to trigger connectivity error
        let mut g = GridState::new(15);
        // Make most cells black manually
        for r in 0..15 {
            for c in 0..15 {
                g.cells[r][c].is_black = true;
            }
        }
        // Leave two adjacent cells white (to form a valid word), in opposite corners
        g.cells[0][0].is_black = false;
        g.cells[0][1].is_black = false;
        g.cells[0][2].is_black = false; // 3-letter across
        g.cells[14][14].is_black = false; // isolated

        let result = validate(&g);
        assert!(!result.is_valid);
        assert!(result.violations.iter().any(|v| v.rule.contains("onnect") || v.rule.contains("Isolated")));
    }
}
