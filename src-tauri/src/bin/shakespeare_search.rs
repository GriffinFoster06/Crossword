use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use crossforge::engine::grid::{GridState, Direction, Cell};
use crossforge::engine::worddb::WordDatabase;
use crossforge::engine::solver::Solver;

const ACROSTIC: &str = "TOBEORNOTTOBETHATISTHEQUESTION";
const SIZE: usize = 15;

fn build_grid_from_strings(rows: &[String]) -> GridState {
    let mut grid = GridState::new(SIZE);
    for (r, row) in rows.iter().take(SIZE).enumerate() {
        for (c, ch) in row.chars().take(SIZE).enumerate() {
            if ch == '#' {
                grid.cells[r][c] = Cell::black();
            }
        }
    }
    grid
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let min_score: u8 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let fill_timeout: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(60);
    let restarts: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(50);

    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let wordlist_path = repo_root.join("src-tauri").join("resources").join("wordlist.bin");
    let grids_path = repo_root.join("data").join("raw").join("acrostic_grids.json");

    eprintln!("Loading word database from {:?}", wordlist_path);
    let db = Arc::new(
        WordDatabase::load_binary(&wordlist_path)
            .unwrap_or_else(|e| {
                eprintln!("Binary load failed ({}), trying text...", e);
                let text_path = repo_root.join("data").join("raw").join("crossword_words.dict");
                WordDatabase::load_text(&text_path)
                    .unwrap_or_else(|_| WordDatabase::load_fallback())
            })
    );
    eprintln!("Database: {} words, min_score={}, timeout={}s, restarts={}",
        db.len(), min_score, fill_timeout, restarts);

    let grids_data = std::fs::read_to_string(&grids_path).expect("cannot read acrostic_grids.json");
    let grids: Vec<serde_json::Value> = serde_json::from_str(&grids_data).expect("invalid JSON");

    let mut indexed: Vec<(usize, u64)> = grids.iter().enumerate()
        .map(|(i, g)| (i, g["max_len"].as_u64().unwrap_or(99)))
        .collect();
    indexed.sort_by_key(|&(_, ml)| ml);

    eprintln!("{} grids loaded, sorted by max_len", indexed.len());

    let cancel = Arc::new(AtomicBool::new(false));
    let global_start = Instant::now();

    for (gi, max_len) in &indexed {
        let grid_val = &grids[*gi];
        let grid_strs: Vec<String> = grid_val["grid"].as_array().unwrap()
            .iter().map(|v| v.as_str().unwrap().to_string()).collect();

        let grid = build_grid_from_strings(&grid_strs);

        let mut g = grid.clone();
        g.compute_numbers();
        let slots = g.get_slots();
        let across_count = slots.iter().filter(|s| s.direction == Direction::Across).count();
        if across_count != 30 {
            continue;
        }

        // Quick check: build solver, run AC-3, check for empty domains
        let mut solver = Solver::new_with_acrostic(
            &g, db.clone(), cancel.clone(), None, min_score, fill_timeout, ACROSTIC
        );

        // Test if AC-3 kills any domains (first solve attempt = deterministic)
        let result = solver.solve();
        if result.success {
            if let Some(puzzle) = verify_and_save(&result, &grid_strs, &repo_root) {
                println!("{}", serde_json::to_string_pretty(&puzzle).unwrap());
                return;
            }
        }

        // Check if AC-3 killed domains (solver finished instantly = dead)
        let elapsed = solver.elapsed_secs();
        if elapsed < 0.5 {
            eprintln!("Grid #{} (ml={}): dead after AC-3 ({:.1}s)", gi, max_len, elapsed);
            continue;
        }

        eprintln!("Grid #{} (ml={}): survived AC-3, ran {:.1}s, trying {} restarts...",
            gi, max_len, elapsed, restarts);

        // Multiple random restarts
        for seed in 1..=restarts {
            let mut solver = Solver::new_with_acrostic(
                &g, db.clone(), cancel.clone(), None, min_score, fill_timeout, ACROSTIC
            );
            solver.shuffle_domains(seed as u64);
            let result = solver.solve();

            if result.success {
                eprintln!("  Restart {}: SUCCESS!", seed);
                if let Some(puzzle) = verify_and_save(&result, &grid_strs, &repo_root) {
                    println!("{}", serde_json::to_string_pretty(&puzzle).unwrap());
                    return;
                }
            } else if seed % 10 == 0 {
                let total_elapsed = global_start.elapsed().as_secs_f64();
                eprintln!("  Restart {}/{}: fail ({:.1}s this, {:.0}s total)",
                    seed, restarts, solver.elapsed_secs(), total_elapsed);
            }
        }
    }

    eprintln!("\nNo grid was fillable.");
    std::process::exit(1);
}

fn verify_and_save(result: &crossforge::engine::solver::AutofillResult, _grid_strs: &[String], repo_root: &Path) -> Option<serde_json::Value> {
    let mut across_words: Vec<(u16, String)> = result.words_placed.iter()
        .filter(|(_, dir, _)| dir == "Across")
        .map(|(n, _, w)| (*n, w.clone()))
        .collect();
    across_words.sort_by_key(|(n, _)| *n);

    let first_letters: String = across_words.iter()
        .map(|(_, w)| w.chars().next().unwrap_or('?'))
        .collect();
    eprintln!("  Acrostic: {}", first_letters);

    if first_letters != ACROSTIC {
        eprintln!("  MISMATCH! Expected {}", ACROSTIC);
        return None;
    }

    let all_words: Vec<&str> = result.words_placed.iter().map(|(_, _, w)| w.as_str()).collect();
    let unique: HashSet<&str> = all_words.iter().copied().collect();
    if all_words.len() != unique.len() {
        eprintln!("  Duplicate words found!");
        return None;
    }

    let result_grid = result.grid.as_ref().unwrap();
    let final_grid: Vec<String> = result_grid.iter().map(|row| {
        row.iter().map(|c| match c { Some(ch) => *ch, None => '#' }).collect()
    }).collect();

    eprintln!("\n*** FILLED SUCCESSFULLY! ***");
    for row_str in &final_grid {
        eprintln!("  {}", row_str);
    }

    let mut across_clues: Vec<serde_json::Value> = Vec::new();
    let mut down_clues: Vec<serde_json::Value> = Vec::new();
    for (num, dir, word) in &result.words_placed {
        let entry = serde_json::json!({ "number": num, "answer": word, "clue": "" });
        if dir == "Across" { across_clues.push(entry); }
        else { down_clues.push(entry); }
    }
    across_clues.sort_by_key(|e| e["number"].as_u64().unwrap_or(0));
    down_clues.sort_by_key(|e| e["number"].as_u64().unwrap_or(0));

    let puzzle = serde_json::json!({
        "title": "To Be or Not to Be",
        "author": "CrossForge AI",
        "size": { "rows": SIZE, "cols": SIZE },
        "grid": final_grid,
        "acrostic": ACROSTIC,
        "note": "The first letters of each across answer spell a famous Hamlet quote.",
        "clues": { "across": across_clues, "down": down_clues },
        "quality_score": result.quality_score,
    });

    let puzzles_dir = repo_root.join("puzzles");
    std::fs::create_dir_all(&puzzles_dir).ok();
    let out_path = puzzles_dir.join("shakespeare.json");
    std::fs::write(&out_path, serde_json::to_string_pretty(&puzzle).unwrap()).unwrap();
    eprintln!("Saved to {:?}", out_path);

    Some(puzzle)
}
