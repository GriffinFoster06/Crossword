/// CrossForge Grid Engine
///
/// Grid data structures, cell numbering (NYT convention), symmetry enforcement,
/// slot extraction, and cell manipulation.

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Cell {
    pub letter: Option<char>,
    pub is_black: bool,
    pub number: Option<u16>,
    /// Rebus: multiple letters in one cell (e.g., "STAR")
    pub rebus: Option<String>,
    /// Visual markers
    pub is_circled: bool,
    pub is_shaded: bool,
    /// Whether this cell is user-locked (autofill won't change it)
    pub is_locked: bool,
}

impl Cell {
    pub fn white() -> Self {
        Self {
            letter: None,
            is_black: false,
            number: None,
            rebus: None,
            is_circled: false,
            is_shaded: false,
            is_locked: false,
        }
    }

    pub fn black() -> Self {
        Self {
            letter: None,
            is_black: true,
            number: None,
            rebus: None,
            is_circled: false,
            is_shaded: false,
            is_locked: false,
        }
    }

    pub fn effective_letter(&self) -> Option<char> {
        if let Some(ref rebus) = self.rebus {
            rebus.chars().next()
        } else {
            self.letter
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Direction {
    Across,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordSlot {
    pub number: u16,
    pub direction: Direction,
    pub row: usize,
    pub col: usize,
    pub length: usize,
    /// Current letters/pattern, e.g. "A__L_"
    pub pattern: String,
    /// Whether every cell in this slot has a letter
    pub is_complete: bool,
    /// Whether user has approved/locked this word (interactive autofill)
    pub is_approved: bool,
}

impl WordSlot {
    pub fn cells(&self) -> Vec<(usize, usize)> {
        (0..self.length)
            .map(|i| match self.direction {
                Direction::Across => (self.row, self.col + i),
                Direction::Down => (self.row + i, self.col),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridState {
    pub size: usize,
    pub cells: Vec<Vec<Cell>>,
}

impl GridState {
    pub fn new(size: usize) -> Self {
        let cells = vec![vec![Cell::white(); size]; size];
        Self { size, cells }
    }

    pub fn get(&self, row: usize, col: usize) -> Option<&Cell> {
        self.cells.get(row)?.get(col)
    }

    pub fn get_mut(&mut self, row: usize, col: usize) -> Option<&mut Cell> {
        self.cells.get_mut(row)?.get_mut(col)
    }

    /// Toggle black square with optional 180° rotational symmetry.
    pub fn toggle_black(&mut self, row: usize, col: usize, symmetric: bool) {
        if row >= self.size || col >= self.size {
            return;
        }
        let is_black = !self.cells[row][col].is_black;
        self.cells[row][col].is_black = is_black;
        if is_black {
            self.cells[row][col].letter = None;
            self.cells[row][col].rebus = None;
        }

        if symmetric {
            let sym_row = self.size - 1 - row;
            let sym_col = self.size - 1 - col;
            self.cells[sym_row][sym_col].is_black = is_black;
            if is_black {
                self.cells[sym_row][sym_col].letter = None;
                self.cells[sym_row][sym_col].rebus = None;
            }
        }
    }

    /// Check whether the grid has 180° rotational symmetry.
    pub fn has_180_symmetry(&self) -> bool {
        for r in 0..self.size {
            for c in 0..self.size {
                let sym_r = self.size - 1 - r;
                let sym_c = self.size - 1 - c;
                if self.cells[r][c].is_black != self.cells[sym_r][sym_c].is_black {
                    return false;
                }
            }
        }
        true
    }

    /// Set a letter in a cell.
    pub fn set_letter(&mut self, row: usize, col: usize, letter: Option<char>) {
        if let Some(cell) = self.get_mut(row, col) {
            if !cell.is_black {
                cell.letter = letter.map(|c| c.to_ascii_uppercase());
                cell.rebus = None;
            }
        }
    }

    /// Compute NYT-convention cell numbers.
    /// A cell gets a number if it starts an Across or Down word.
    /// Numbers assigned left→right, top→bottom, incrementing from 1.
    pub fn compute_numbers(&mut self) {
        let size = self.size;
        let mut n = 1u16;

        for row in 0..size {
            for col in 0..size {
                self.cells[row][col].number = None;
            }
        }

        for row in 0..size {
            for col in 0..size {
                if self.cells[row][col].is_black {
                    continue;
                }

                let starts_across = self.starts_across(row, col);
                let starts_down = self.starts_down(row, col);

                if starts_across || starts_down {
                    self.cells[row][col].number = Some(n);
                    n += 1;
                }
            }
        }
    }

    fn starts_across(&self, row: usize, col: usize) -> bool {
        if self.cells[row][col].is_black {
            return false;
        }
        // Left edge or left neighbor is black
        let left_ok = col == 0 || self.cells[row][col - 1].is_black;
        // At least one white cell to the right
        let right_ok = col + 1 < self.size && !self.cells[row][col + 1].is_black;
        left_ok && right_ok
    }

    fn starts_down(&self, row: usize, col: usize) -> bool {
        if self.cells[row][col].is_black {
            return false;
        }
        // Top edge or top neighbor is black
        let top_ok = row == 0 || self.cells[row - 1][col].is_black;
        // At least one white cell below
        let bottom_ok = row + 1 < self.size && !self.cells[row + 1][col].is_black;
        top_ok && bottom_ok
    }

    /// Extract all word slots from the current grid.
    pub fn get_slots(&self) -> Vec<WordSlot> {
        let size = self.size;
        let mut slots = Vec::new();

        for row in 0..size {
            for col in 0..size {
                if self.cells[row][col].is_black {
                    continue;
                }

                let number = self.cells[row][col].number;

                // Across slot starting here?
                if self.starts_across(row, col) {
                    if let (Some(length), pattern) = self.measure_slot(row, col, Direction::Across) {
                        let is_complete = pattern.chars().all(|c| c != '_');
                        slots.push(WordSlot {
                            number: number.unwrap_or(0),
                            direction: Direction::Across,
                            row,
                            col,
                            length,
                            pattern,
                            is_complete,
                            is_approved: false,
                        });
                    }
                }

                // Down slot starting here?
                if self.starts_down(row, col) {
                    if let (Some(length), pattern) = self.measure_slot(row, col, Direction::Down) {
                        let is_complete = pattern.chars().all(|c| c != '_');
                        slots.push(WordSlot {
                            number: number.unwrap_or(0),
                            direction: Direction::Down,
                            row,
                            col,
                            length,
                            pattern,
                            is_complete,
                            is_approved: false,
                        });
                    }
                }
            }
        }

        slots
    }

    fn measure_slot(&self, row: usize, col: usize, dir: Direction) -> (Option<usize>, String) {
        let size = self.size;
        let mut length = 0usize;
        let mut pattern = String::new();

        let mut r = row;
        let mut c = col;

        loop {
            if r >= size || c >= size {
                break;
            }
            let cell = &self.cells[r][c];
            if cell.is_black {
                break;
            }

            let ch = cell.effective_letter().unwrap_or('_');
            pattern.push(ch);
            length += 1;

            match dir {
                Direction::Across => c += 1,
                Direction::Down => r += 1,
            }
        }

        if length >= 3 {
            (Some(length), pattern)
        } else {
            (None, String::new())
        }
    }

    /// Place a word into the grid at the given slot position.
    pub fn place_word(&mut self, slot: &WordSlot, word: &str) {
        for (i, ch) in word.chars().enumerate() {
            let (r, c) = match slot.direction {
                Direction::Across => (slot.row, slot.col + i),
                Direction::Down => (slot.row + i, slot.col),
            };
            if r < self.size && c < self.size {
                self.cells[r][c].letter = Some(ch.to_ascii_uppercase());
            }
        }
    }

    /// Clear all non-locked letters from the grid.
    pub fn clear_fill(&mut self) {
        for row in self.cells.iter_mut() {
            for cell in row.iter_mut() {
                if !cell.is_locked && !cell.is_black {
                    cell.letter = None;
                }
            }
        }
    }

    /// Check if the grid has 180-degree rotational symmetry.
    pub fn has_rotational_symmetry(&self) -> bool {
        let size = self.size;
        for row in 0..size {
            for col in 0..size {
                let sym_row = size - 1 - row;
                let sym_col = size - 1 - col;
                if self.cells[row][col].is_black != self.cells[sym_row][sym_col].is_black {
                    return false;
                }
            }
        }
        true
    }

    /// Get all white cells reachable via flood fill from the first white cell.
    pub fn connected_white_cells(&self) -> usize {
        let size = self.size;
        let mut visited = vec![vec![false; size]; size];
        let mut queue = std::collections::VecDeque::new();

        // Find first white cell
        'outer: for row in 0..size {
            for col in 0..size {
                if !self.cells[row][col].is_black {
                    queue.push_back((row, col));
                    visited[row][col] = true;
                    break 'outer;
                }
            }
        }

        let mut count = 0;
        while let Some((row, col)) = queue.pop_front() {
            count += 1;
            for (dr, dc) in [(-1i32, 0), (1, 0), (0, -1i32), (0, 1)] {
                let nr = row as i32 + dr;
                let nc = col as i32 + dc;
                if nr >= 0 && nr < size as i32 && nc >= 0 && nc < size as i32 {
                    let (nr, nc) = (nr as usize, nc as usize);
                    if !visited[nr][nc] && !self.cells[nr][nc].is_black {
                        visited[nr][nc] = true;
                        queue.push_back((nr, nc));
                    }
                }
            }
        }
        count
    }

    pub fn total_white_cells(&self) -> usize {
        self.cells.iter().flatten().filter(|c| !c.is_black).count()
    }

    pub fn black_cell_count(&self) -> usize {
        self.cells.iter().flatten().filter(|c| c.is_black).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_grid(size: usize) -> GridState {
        let mut g = GridState::new(size);
        g.compute_numbers();
        g
    }

    #[test]
    fn test_cell_numbering_empty_3x3() {
        let mut g = GridState::new(3);
        g.compute_numbers();
        // Top-left cell starts both an Across and Down word → number 1
        assert_eq!(g.cells[0][0].number, Some(1));
        // Middle cell starts a Down word (if no black squares it does not start across)
        // In a fully white 3×3: 0,0=1 (A+D), 0,1=2 (D only), 0,2=3 (A+D)... wait:
        // 0,0: starts_across (left edge, right neighbor white, size≥2) ✓, starts_down ✓ → 1
        // 0,1: starts_across? left not black = false. starts_down? top edge ✓, bottom white ✓ → 2
        // 0,2: starts_across? col+1=3=size, no right neighbor → false. starts_down ✓ → 3
        // 1,0: starts_across ✓ (left edge, right white) → 4. starts_down? top not black → false → 4
        // 1,2: starts_across? left[1,1] not black → false. starts_down? top[0,2] not black → false → no number
        // 2,0: starts_across ✓ → 5. starts_down? bottom = row+1=3=size → false → 5
        assert_eq!(g.cells[0][1].number, Some(2));
        assert_eq!(g.cells[0][2].number, Some(3));
        assert_eq!(g.cells[1][0].number, Some(4));
        assert_eq!(g.cells[1][2].number, None);
        assert_eq!(g.cells[2][0].number, Some(5));
    }

    #[test]
    fn test_toggle_black_symmetric() {
        let mut g = GridState::new(5);
        g.toggle_black(0, 0, true);
        assert!(g.cells[0][0].is_black);
        // Symmetric partner: (4, 4)
        assert!(g.cells[4][4].is_black);
        // Toggle back
        g.toggle_black(0, 0, true);
        assert!(!g.cells[0][0].is_black);
        assert!(!g.cells[4][4].is_black);
    }

    #[test]
    fn test_toggle_black_no_symmetry() {
        let mut g = GridState::new(5);
        g.toggle_black(1, 1, false);
        assert!(g.cells[1][1].is_black);
        assert!(!g.cells[3][3].is_black); // symmetric partner not affected
    }

    #[test]
    fn test_set_letter_uppercase() {
        let mut g = GridState::new(3);
        g.set_letter(0, 0, Some('a'));
        assert_eq!(g.cells[0][0].letter, Some('A'));
    }

    #[test]
    fn test_set_letter_on_black_noop() {
        let mut g = GridState::new(3);
        g.toggle_black(0, 0, false);
        g.set_letter(0, 0, Some('X'));
        assert_eq!(g.cells[0][0].letter, None);
    }

    #[test]
    fn test_get_slots_empty_3x3() {
        let mut g = GridState::new(3);
        g.compute_numbers();
        let slots = g.get_slots();
        // All-white 3×3: 3 across + 3 down = 6 slots of length 3
        assert_eq!(slots.len(), 6);
        assert!(slots.iter().all(|s| s.length == 3));
    }

    #[test]
    fn test_connectivity_all_white() {
        let g = GridState::new(5);
        let reachable = g.connected_white_cells();
        let total = g.total_white_cells();
        assert_eq!(reachable, total);
    }

    #[test]
    fn test_has_symmetry_empty_grid() {
        let g = GridState::new(5);
        assert!(g.has_180_symmetry());
    }

    #[test]
    fn test_has_symmetry_symmetric_black() {
        let mut g = GridState::new(5);
        g.toggle_black(0, 1, false);
        g.toggle_black(4, 3, false); // symmetric partner of (0,1) in 5×5
        assert!(g.has_180_symmetry());
    }

    #[test]
    fn test_slot_pattern_with_letters() {
        let mut g = GridState::new(3);
        g.compute_numbers();
        g.set_letter(0, 0, Some('C'));
        g.set_letter(0, 2, Some('T'));
        let slots = g.get_slots();
        let row0_across = slots.iter().find(|s| s.direction == Direction::Across && s.row == 0).unwrap();
        assert_eq!(row0_across.pattern, "C_T");
    }

    #[test]
    fn test_effective_letter_rebus() {
        let mut c = Cell::white();
        c.rebus = Some("STAR".to_string());
        assert_eq!(c.effective_letter(), Some('S'));
    }
}
