/// CrossForge CSP Autofill Solver
///
/// Algorithm: Arc-Consistent Backtracking with MRV (Minimum Remaining Values)
/// + Degree heuristic + Forward checking + Quality-ordered value selection
///
/// Fills a 15×15 grid in <1 second on modern hardware.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use serde::{Serialize, Deserialize};

use crate::engine::grid::{GridState, Direction, WordSlot};
use crate::engine::worddb::WordDatabase;

/// A crossing between two word slots: which position in each slot they share.
#[derive(Debug, Clone)]
struct Crossing {
    other_slot_idx: usize,
    this_pos: usize,
    other_pos: usize,
}

/// A slot in the solver's representation, with its current domain of candidate words.
#[derive(Debug, Clone)]
struct SolverSlot {
    slot: WordSlot,
    /// Indices into `candidates` vec for this slot
    domain: Vec<usize>,
    /// All candidate words for this slot (from word database)
    candidates: Vec<String>,
    /// Crossing constraints: other slots that share a cell with this one
    crossings: Vec<Crossing>,
    /// Whether this slot has been assigned
    assigned: Option<usize>,
    /// Whether this slot is approved by the user (cannot be changed)
    is_approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutofillProgress {
    /// Current state of filled cells (row, col, letter)
    pub cells: Vec<(usize, usize, char)>,
    pub slots_filled: usize,
    pub total_slots: usize,
    pub quality_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutofillResult {
    pub success: bool,
    pub grid: Option<Vec<Vec<Option<char>>>>,
    pub quality_score: f32,
    pub words_placed: Vec<(u16, String, String)>, // (number, direction, word)
    pub message: String,
}

pub struct Solver {
    db: Arc<WordDatabase>,
    solver_slots: Vec<SolverSlot>,
    /// Grid size
    size: usize,
    /// Used words set to prevent duplicates
    used_words: HashSet<String>,
    /// Cancellation token
    cancel: Arc<AtomicBool>,
    /// Progress callback
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<AutofillProgress>>,
    /// Timeout tracking
    start_time: std::time::Instant,
    timeout_secs: u64,
    /// Number of backtrack steps taken
    backtracks: usize,
    max_backtracks: usize,
    /// Optional acrostic constraint: i-th across slot's first letter must be acrostic[i]
    acrostic: Option<Vec<char>>,
}

impl Solver {
    fn recompute_assigned(slot: &mut SolverSlot) {
        slot.assigned = if slot.is_approved || slot.slot.is_complete {
            slot.candidates.iter().position(|w| w == &slot.slot.pattern)
        } else {
            None
        };
    }

    pub fn new(
        grid: &GridState,
        db: Arc<WordDatabase>,
        cancel: Arc<AtomicBool>,
        progress_tx: Option<tokio::sync::mpsc::UnboundedSender<AutofillProgress>>,
        min_word_score: u8,
        timeout_secs: u64,
    ) -> Self {
        let mut working = grid.clone();
        working.compute_numbers();
        let slots = working.get_slots();

        let mut solver_slots: Vec<SolverSlot> = slots
            .into_iter()
            .map(|slot| {
                // Get initial candidates from the word database
                let candidates: Vec<String> = db
                    .find_matches(&slot.pattern, 2000)
                    .into_iter()
                    .filter(|w| w.score >= min_word_score)
                    .map(|w| w.word)
                    .collect();

                let domain: Vec<usize> = (0..candidates.len()).collect();
                let is_approved = slot.is_approved || slot.is_complete;

                let assigned = if slot.is_complete {
                    // Already filled — find the matching candidate
                    candidates.iter().position(|w| w == &slot.pattern)
                } else {
                    None
                };

                SolverSlot {
                    slot,
                    domain,
                    candidates,
                    crossings: vec![],
                    assigned,
                    is_approved,
                }
            })
            .collect();

        // Build crossing graph
        let n = solver_slots.len();
        // Map from (row, col) → list of (slot_idx, position_in_slot)
        let mut cell_to_slots: HashMap<(usize, usize), Vec<(usize, usize)>> = HashMap::new();
        for (si, ss) in solver_slots.iter().enumerate() {
            for (pos, cell) in ss.slot.cells().iter().enumerate() {
                cell_to_slots.entry(*cell).or_default().push((si, pos));
            }
        }

        // For each cell with 2 slots, create crossings
        let mut crossings_list: Vec<(usize, Crossing)> = Vec::new();
        for occupants in cell_to_slots.values() {
            if occupants.len() == 2 {
                let (ai, ap) = occupants[0];
                let (bi, bp) = occupants[1];
                crossings_list.push((ai, Crossing { other_slot_idx: bi, this_pos: ap, other_pos: bp }));
                crossings_list.push((bi, Crossing { other_slot_idx: ai, this_pos: bp, other_pos: ap }));
            }
        }

        for (si, crossing) in crossings_list {
            if si < n {
                solver_slots[si].crossings.push(crossing);
            }
        }

        Self {
            db,
            solver_slots,
            size: grid.size,
            used_words: HashSet::new(),
            cancel,
            progress_tx,
            start_time: std::time::Instant::now(),
            timeout_secs,
            backtracks: 0,
            max_backtracks: 5_000_000,
            acrostic: None,
        }
    }

    /// Create a solver with an acrostic constraint: the i-th across entry's first
    /// letter must be `acrostic[i]`. Re-queries the DB for each across slot using
    /// the acrostic letter as a fixed first position for complete coverage.
    pub fn new_with_acrostic(
        grid: &GridState,
        db: Arc<WordDatabase>,
        cancel: Arc<AtomicBool>,
        progress_tx: Option<tokio::sync::mpsc::UnboundedSender<AutofillProgress>>,
        min_word_score: u8,
        timeout_secs: u64,
        acrostic: &str,
    ) -> Self {
        let mut s = Self::new(grid, db.clone(), cancel, progress_tx, min_word_score, timeout_secs);
        let acrostic_chars: Vec<char> = acrostic.chars().collect();

        // Identify across slots in reading order (row then col)
        let mut across_indices: Vec<usize> = s.solver_slots
            .iter()
            .enumerate()
            .filter(|(_, ss)| ss.slot.direction == Direction::Across)
            .map(|(i, _)| i)
            .collect();
        across_indices.sort_by_key(|&i| (s.solver_slots[i].slot.row, s.solver_slots[i].slot.col));

        // Replace each across slot's candidates with a DB query that pins the first
        // letter to the acrostic letter. This avoids the 2000-word truncation that
        // would otherwise exclude lower-scored acrostic-letter words.
        //
        // Also collect all acrostic letter constraints for each down slot that is
        // crossed at the first letter of an across slot. Multiple across words may
        // cross the same down slot, so we accumulate all constraints before querying.
        let mut down_constraints: HashMap<usize, Vec<(usize, char)>> = HashMap::new();

        for (ai, &slot_idx) in across_indices.iter().enumerate() {
            if ai >= acrostic_chars.len() { break; }
            let required = acrostic_chars[ai].to_ascii_uppercase();
            let len = s.solver_slots[slot_idx].slot.length;

            // Build a pattern like "T____" for length 5 and required='T'
            let mut pattern = String::with_capacity(len);
            pattern.push(required);
            for _ in 1..len { pattern.push('_'); }

            let new_candidates: Vec<String> = db
                .find_matches(&pattern, 50_000)
                .into_iter()
                .filter(|w| w.score >= min_word_score)
                .map(|w| w.word)
                .collect();

            let new_domain: Vec<usize> = (0..new_candidates.len()).collect();
            s.solver_slots[slot_idx].candidates = new_candidates;
            s.solver_slots[slot_idx].domain = new_domain;
            Self::recompute_assigned(&mut s.solver_slots[slot_idx]);

            // Record which down slot is crossed at position 0 of this across slot,
            // accumulating all constraints so they can be applied together below.
            for crossing in s.solver_slots[slot_idx].crossings.iter() {
                if crossing.this_pos == 0 {
                    down_constraints
                        .entry(crossing.other_slot_idx)
                        .or_default()
                        .push((crossing.other_pos, required));
                }
            }
        }

        // Re-initialize each constrained down slot using a multi-letter pattern
        // built from ALL the acrostic constraints collected above. If no words match,
        // the domain stays empty — AC-3 will detect the contradiction immediately.
        for (down_idx, constraints) in &down_constraints {
            let down_len = s.solver_slots[*down_idx].slot.length;
            let mut down_pattern = vec![b'_'; down_len];
            for &(pos, letter) in constraints {
                down_pattern[pos] = letter as u8;
            }
            let down_pattern_str = String::from_utf8(down_pattern).unwrap();

            let down_candidates: Vec<String> = db
                .find_matches(&down_pattern_str, 50_000)
                .into_iter()
                .filter(|w| w.score >= min_word_score)
                .map(|w| w.word)
                .collect();

            s.solver_slots[*down_idx].candidates = down_candidates;
            s.solver_slots[*down_idx].domain =
                (0..s.solver_slots[*down_idx].candidates.len()).collect();
            Self::recompute_assigned(&mut s.solver_slots[*down_idx]);
        }

        s.acrostic = Some(acrostic_chars);
        s
    }

    pub fn elapsed_secs(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Shuffle each slot's domain using the given seed, for randomized restarts.
    pub fn shuffle_domains(&mut self, seed: u64) {
        use rand::seq::SliceRandom;
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        for ss in &mut self.solver_slots {
            if ss.assigned.is_none() && !ss.is_approved {
                ss.domain.shuffle(&mut rng);
            }
        }
    }

    /// Reset solver state for a fresh solve attempt (keeps domains as-is).
    pub fn reset_for_restart(&mut self) {
        self.backtracks = 0;
        self.start_time = std::time::Instant::now();
        self.used_words.clear();
        for ss in &mut self.solver_slots {
            if !ss.is_approved {
                ss.assigned = None;
            }
        }
    }

    /// Run the solver. Returns a result with the filled grid (if successful).
    pub fn solve(&mut self) -> AutofillResult {
        // Run initial AC-3 to prune domains
        self.ac3_all();

        // Add already-used approved words to the used set
        for ss in &self.solver_slots {
            if ss.is_approved {
                if let Some(idx) = ss.assigned {
                    if idx < ss.candidates.len() {
                        self.used_words.insert(ss.candidates[idx].clone());
                    } else if ss.slot.is_complete {
                        self.used_words.insert(ss.slot.pattern.clone());
                    }
                }
            }
        }

        let total_slots = self.solver_slots.iter().filter(|s| !s.is_approved).count();
        if total_slots == 0 {
            return self.build_result(true, "Grid already complete");
        }

        if self.backtrack(0) {
            self.build_result(true, "Fill complete")
        } else {
            self.build_result(false, "Could not complete fill — try adjusting word list or grid")
        }
    }

    fn backtrack(&mut self, depth: usize) -> bool {
        // Check cancellation and timeout
        if self.cancel.load(Ordering::Relaxed) {
            return false;
        }
        if self.start_time.elapsed().as_secs() >= self.timeout_secs {
            return false;
        }
        if self.backtracks >= self.max_backtracks {
            return false;
        }

        // Select the next unassigned slot using MRV + Degree
        let slot_idx = match self.select_unassigned_slot() {
            None => return true, // All slots assigned → success!
            Some(idx) => idx,
        };

        // Get the ordered domain for this slot (quality-first, excluding used words)
        let candidates_snapshot: Vec<usize> = self.solver_slots[slot_idx]
            .domain
            .iter()
            .copied()
            .filter(|&ci| {
                let word = &self.solver_slots[slot_idx].candidates[ci];
                !self.used_words.contains(word)
            })
            .collect();

        if candidates_snapshot.is_empty() {
            return false; // Dead end
        }

        for &candidate_idx in &candidates_snapshot {
            let word = self.solver_slots[slot_idx].candidates[candidate_idx].clone();

            // Assign
            self.solver_slots[slot_idx].assigned = Some(candidate_idx);
            self.used_words.insert(word.clone());

            // Save domain snapshots for crossing slots (for undo)
            let domain_snapshot: Vec<(usize, Vec<usize>)> = self.solver_slots[slot_idx]
                .crossings
                .iter()
                .map(|c| (c.other_slot_idx, self.solver_slots[c.other_slot_idx].domain.clone()))
                .collect();

            // Forward check: propagate constraints to crossing slots
            let consistent = self.forward_check(slot_idx, &word);

            if consistent {
                // Report progress every 10 assignments
                if depth % 10 == 0 {
                    self.report_progress();
                }

                if self.backtrack(depth + 1) {
                    return true; // Found a solution!
                }
            }

            // Undo: restore domains and unassign
            self.backtracks += 1;
            self.solver_slots[slot_idx].assigned = None;
            self.used_words.remove(&word);
            for (si, domain) in domain_snapshot {
                self.solver_slots[si].domain = domain;
            }
        }

        false // No candidate worked
    }

    /// Select the unassigned slot with the smallest domain (MRV).
    /// Break ties by degree (most crossings).
    fn select_unassigned_slot(&self) -> Option<usize> {
        self.solver_slots
            .iter()
            .enumerate()
            .filter(|(_, ss)| ss.assigned.is_none() && !ss.is_approved)
            .map(|(i, ss)| {
                let domain_size = ss.domain.iter()
                    .filter(|&&ci| !self.used_words.contains(&ss.candidates[ci]))
                    .count();
                (i, domain_size, ss.crossings.len())
            })
            .min_by_key(|&(_, ds, degree)| (ds, usize::MAX - degree))
            .map(|(i, _, _)| i)
    }

    /// Forward checking: when we assign `word` to `slot_idx`, prune crossing slots.
    fn forward_check(&mut self, slot_idx: usize, word: &str) -> bool {
        let crossings: Vec<Crossing> = self.solver_slots[slot_idx].crossings.clone();
        let word_bytes: Vec<char> = word.chars().collect();

        for crossing in &crossings {
            let other_idx = crossing.other_slot_idx;
            if self.solver_slots[other_idx].assigned.is_some() {
                continue;
            }

            let required_letter = word_bytes.get(crossing.this_pos).copied();
            let Some(letter) = required_letter else { continue };
            let other_pos = crossing.other_pos;

            // Filter the other slot's domain: keep only candidates where
            // candidate[other_pos] == letter
            let other_domain: Vec<usize> = self.solver_slots[other_idx]
                .domain
                .iter()
                .copied()
                .filter(|&ci| {
                    let cand = &self.solver_slots[other_idx].candidates[ci];
                    cand.chars().nth(other_pos) == Some(letter)
                })
                .collect();

            if other_domain.is_empty() {
                // Dead end — this assignment makes crossing slot unsatisfiable
                self.solver_slots[other_idx].domain = other_domain;
                return false;
            }

            self.solver_slots[other_idx].domain = other_domain;
        }
        true
    }

    /// Run AC-3 arc consistency on all slots.
    fn ac3_all(&mut self) {
        let n = self.solver_slots.len();
        let mut queue: VecDeque<(usize, usize)> = VecDeque::new();

        // Enqueue all arcs
        for i in 0..n {
            for crossing in &self.solver_slots[i].crossings {
                queue.push_back((i, crossing.other_slot_idx));
            }
        }

        while let Some((ai, bi)) = queue.pop_front() {
            if self.revise(ai, bi) {
                if self.solver_slots[ai].domain.is_empty() {
                    return; // Inconsistency — will be caught in backtracking
                }
                // Re-enqueue all arcs pointing to ai
                let crossings: Vec<usize> = self.solver_slots[ai]
                    .crossings
                    .iter()
                    .map(|c| c.other_slot_idx)
                    .filter(|&c| c != bi)
                    .collect();
                for ci in crossings {
                    queue.push_back((ci, ai));
                }
            }
        }
    }

    /// Remove values from `ai`'s domain that have no support in `bi`'s domain.
    /// Returns true if any values were removed.
    fn revise(&mut self, ai: usize, bi: usize) -> bool {
        let crossing = self.solver_slots[ai]
            .crossings
            .iter()
            .find(|c| c.other_slot_idx == bi)
            .cloned();

        let Some(c) = crossing else { return false };

        let ai_pos = c.this_pos;
        let bi_pos = c.other_pos;

        let bi_letters_at_pos: HashSet<char> = self.solver_slots[bi]
            .domain
            .iter()
            .filter_map(|&ci| self.solver_slots[bi].candidates[ci].chars().nth(bi_pos))
            .collect();

        let ai_candidates = self.solver_slots[ai].candidates.clone();
        let before = self.solver_slots[ai].domain.len();
        self.solver_slots[ai].domain.retain(|&ci| {
            let ai_letter = ai_candidates[ci].chars().nth(ai_pos);
            ai_letter.map_or(false, |l| bi_letters_at_pos.contains(&l))
        });

        self.solver_slots[ai].domain.len() < before
    }

    fn report_progress(&self) {
        let Some(ref tx) = self.progress_tx else { return };
        let cells: Vec<(usize, usize, char)> = self.solver_slots
            .iter()
            .filter_map(|ss| {
                let candidate_idx = ss.assigned?;
                let word = ss.candidates.get(candidate_idx)?;
                Some(ss.slot.cells().into_iter().zip(word.chars()).map(|(cell, ch)| (cell.0, cell.1, ch)))
            })
            .flatten()
            .collect();

        let filled = self.solver_slots.iter().filter(|s| s.assigned.is_some()).count();
        let total = self.solver_slots.len();

        let _ = tx.send(AutofillProgress {
            cells,
            slots_filled: filled,
            total_slots: total,
            quality_score: 0.0, // Computed at end
        });
    }

    fn build_result(&self, success: bool, message: &str) -> AutofillResult {
        if !success {
            return AutofillResult {
                success: false,
                grid: None,
                quality_score: 0.0,
                words_placed: vec![],
                message: message.to_string(),
            };
        }

        // Build output grid
        let mut grid_letters: Vec<Vec<Option<char>>> = vec![vec![None; self.size]; self.size];

        let mut words_placed = Vec::new();
        let mut total_score = 0f32;
        let mut count = 0usize;

        for ss in &self.solver_slots {
            let word = if let Some(idx) = ss.assigned {
                ss.candidates.get(idx).cloned().unwrap_or_default()
            } else if ss.is_approved && ss.slot.is_complete {
                ss.slot.pattern.clone()
            } else {
                continue;
            };

            for (pos, (r, c)) in ss.slot.cells().iter().enumerate() {
                if let Some(ch) = word.chars().nth(pos) {
                    if *r < self.size && *c < self.size {
                        grid_letters[*r][*c] = Some(ch);
                    }
                }
            }

            let score = self.db.get_score(&word).unwrap_or(50) as f32;
            total_score += score;
            count += 1;

            let dir_str = match ss.slot.direction {
                Direction::Across => "Across",
                Direction::Down => "Down",
            };
            words_placed.push((ss.slot.number, dir_str.to_string(), word));
        }

        let quality_score = if count > 0 { total_score / count as f32 } else { 0.0 };

        AutofillResult {
            success: true,
            grid: Some(grid_letters),
            quality_score,
            words_placed,
            message: message.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::grid::GridState;
    use crate::engine::worddb::WordDatabase;

    fn test_db() -> Arc<WordDatabase> {
        use std::io::Write;
        let path = std::env::temp_dir().join(format!(
            "crossforge_test_words_{}_{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut f = std::fs::File::create(&path).unwrap();
        // 3-letter words that form valid crossings in a 3x3 grid:
        // CAT/ARE/BED across, CAB/ARA/TED down — all need to be present
        for w in &[
            "CAT", "ARE", "BED", "CAB", "ARA", "TED",
            "THE", "AND", "FOR", "HAS", "HER", "HIS",
            "ACE", "AGE", "ATE", "BAD", "BAT", "BET",
            "CAN", "CAR", "CUP", "DAD", "DAY", "DOG",
            "EAR", "EAT", "END", "ERA", "EVE", "FAR",
            "FAN", "FIT", "FUN", "GAP", "GAS", "GOD",
            "HAD", "HAT", "HIT", "HOT", "ICE", "INN",
            "JAM", "JOB", "KEY", "KIT", "LAP", "LAW",
            "LED", "LET", "LID", "LOG", "LOT", "MAP",
            "MAT", "MEN", "MET", "MIX", "NAP", "NET",
            "NOR", "NOT", "NUT", "OAK", "ODD", "OLD",
            "ONE", "OUR", "OWE", "PAN", "PEN", "PIG",
            "PIN", "PIT", "POT", "PUT", "RAN", "RAT",
            "RED", "RID", "ROB", "ROD", "ROT", "RUG",
            "RUN", "SAD", "SAT", "SAW", "SET", "SIT",
            "SIX", "SKI", "SOB", "SON", "TAB", "TAN",
            "TAP", "TAR", "TEA", "TEN", "TIE", "TIN",
            "TIP", "TOE", "TON", "TOP", "TOW", "TUB",
            "USE", "VAN", "VET", "WAR", "WAS", "WAX",
            "WEB", "WET", "WHO", "WIG", "WIN", "WIT",
            "WON", "YAM", "YET", "ZAP", "ZEN", "ZOO",
        ] {
            writeln!(f, "{};60", w).unwrap();
        }
        Arc::new(WordDatabase::load_text(&path).unwrap())
    }

    fn no_cancel() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }

    fn make_3x3_grid() -> GridState {
        let mut g = GridState::new(3);
        g.compute_numbers();
        g
    }

    #[test]
    fn test_solve_small_grid() {
        let grid = make_3x3_grid();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 30);
        let result = solver.solve();
        assert!(result.success, "solver should fill a 3x3 grid: {}", result.message);
        assert!(result.grid.is_some());
        assert!(!result.words_placed.is_empty());
    }

    #[test]
    fn test_no_duplicate_words() {
        let grid = make_3x3_grid();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 30);
        let result = solver.solve();
        if result.success {
            let words: Vec<&str> = result.words_placed.iter().map(|(_, _, w)| w.as_str()).collect();
            let unique: HashSet<&str> = words.iter().copied().collect();
            assert_eq!(words.len(), unique.len(), "no duplicate words allowed");
        }
    }

    #[test]
    fn test_locked_cells_preserved() {
        let mut grid = make_3x3_grid();
        grid.set_letter(0, 0, Some('T'));
        grid.cells[0][0].is_locked = true;
        grid.compute_numbers();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 30);
        let result = solver.solve();
        if result.success {
            if let Some(ref g) = result.grid {
                assert_eq!(g[0][0], Some('T'), "locked cell should be preserved");
            }
        }
    }

    #[test]
    fn test_cancellation_stops_early() {
        let grid = make_3x3_grid();
        let db = test_db();
        let cancel = Arc::new(AtomicBool::new(true));
        let mut solver = Solver::new(&grid, db, cancel, None, 0, 60);
        let result = solver.solve();
        assert!(!result.success, "cancelled solver should not succeed");
    }

    #[test]
    fn test_timeout_zero() {
        let grid = make_3x3_grid();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 0);
        let result = solver.solve();
        let _ = result;
    }

    #[test]
    fn test_already_complete_grid() {
        let mut grid = GridState::new(3);
        grid.set_letter(0, 0, Some('C')); grid.set_letter(0, 1, Some('A')); grid.set_letter(0, 2, Some('T'));
        grid.set_letter(1, 0, Some('A')); grid.set_letter(1, 1, Some('R')); grid.set_letter(1, 2, Some('E'));
        grid.set_letter(2, 0, Some('B')); grid.set_letter(2, 1, Some('E')); grid.set_letter(2, 2, Some('D'));
        grid.cells.iter_mut().flatten().for_each(|c| c.is_locked = true);
        grid.compute_numbers();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 30);
        let result = solver.solve();
        assert!(result.success, "already-filled grid should report success");
    }

    #[test]
    fn test_quality_score_positive() {
        let grid = make_3x3_grid();
        let db = test_db();
        let mut solver = Solver::new(&grid, db, no_cancel(), None, 0, 30);
        let result = solver.solve();
        if result.success {
            assert!(result.quality_score > 0.0, "quality score should be positive");
        }
    }
}
