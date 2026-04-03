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
}

impl Solver {
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
            max_backtracks: 500_000,
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
