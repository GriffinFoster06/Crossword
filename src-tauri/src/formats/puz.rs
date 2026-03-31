/// .puz (Across Lite) file format reader/writer.
///
/// Binary format spec: https://code.google.com/archive/p/puz/wikis/FileFormat.wiki
///
/// Header (52 bytes):
///   0x00: checksum (u16 LE)
///   0x02: "ACROSS&DOWN\0" magic (12 bytes)
///   0x0E: CIB checksum (u16 LE)
///   0x10: masked checksums (8 bytes)
///   0x18: version string "1.3\0" (4 bytes)
///   0x1C: reserved (2 bytes)
///   0x1E: scrambled checksum (u16 LE)
///   0x20: reserved (12 bytes)
///   0x2C: width (u8)
///   0x2D: height (u8)
///   0x2E: num clues (u16 LE)
///   0x30: unknown bitmask (u16 LE)
///   0x32: scrambled tag (u16 LE)
/// Then:
///   solution: width*height bytes ('.' for black)
///   state: width*height bytes ('-' for empty, '.' for black)
///   strings (null-terminated): title, author, copyright, then clues, then notes

use crate::engine::grid::{GridState, Cell, Direction};
use crate::formats::json::{PuzzleFile, PuzzleMetadata, PuzzleClues, ClueData};

const MAGIC: &[u8] = b"ACROSS&DOWN\0";

pub fn import_puz(data: &[u8]) -> anyhow::Result<PuzzleFile> {
    if data.len() < 52 {
        anyhow::bail!("File too small to be a valid .puz file");
    }

    // Verify magic
    if &data[0x02..0x0E] != MAGIC {
        anyhow::bail!("Invalid .puz file: bad magic");
    }

    let width = data[0x2C] as usize;
    let height = data[0x2D] as usize;
    let num_clues = u16::from_le_bytes([data[0x2E], data[0x2F]]) as usize;

    if width == 0 || height == 0 || width > 25 || height > 25 {
        anyhow::bail!("Invalid grid dimensions: {}x{}", width, height);
    }

    let grid_size = width * height;
    let solution_start = 52;
    let state_start = solution_start + grid_size;
    let strings_start = state_start + grid_size;

    if data.len() < strings_start {
        anyhow::bail!("File truncated: not enough data for grid");
    }

    // Parse solution grid
    let solution = &data[solution_start..state_start];
    let mut cells = vec![vec![Cell::white(); width]; height];
    for row in 0..height {
        for col in 0..width {
            let ch = solution[row * width + col];
            if ch == b'.' {
                cells[row][col] = Cell::black();
            } else {
                cells[row][col].letter = Some(ch as char);
            }
        }
    }

    let mut grid = GridState { size: width, cells };
    grid.compute_numbers();

    // Parse null-terminated strings
    let strings_data = &data[strings_start..];
    let strings = parse_null_terminated_strings(strings_data, num_clues + 3); // title, author, copyright, clues...

    let title = strings.first().cloned().unwrap_or_default();
    let author = strings.get(1).cloned().unwrap_or_default();
    let copyright = strings.get(2).cloned().unwrap_or_default();

    // Map clues to across/down slots
    let slots = grid.get_slots();
    let mut across_clues = Vec::new();
    let mut down_clues = Vec::new();
    let mut clue_idx = 3; // Skip title, author, copyright

    for slot in &slots {
        let clue_text = strings.get(clue_idx).cloned().unwrap_or_default();
        clue_idx += 1;

        let clue_data = ClueData {
            number: slot.number,
            text: clue_text,
            answer: slot.pattern.clone(),
            is_theme_entry: false,
        };

        match slot.direction {
            Direction::Across => across_clues.push(clue_data),
            Direction::Down => down_clues.push(clue_data),
        }
    }

    Ok(PuzzleFile {
        version: 1,
        metadata: PuzzleMetadata {
            title,
            author,
            editor: String::new(),
            copyright,
            date: None,
            difficulty: None,
            notes: None,
        },
        grid,
        clues: PuzzleClues {
            across: across_clues,
            down: down_clues,
        },
        theme: None,
        notes: strings.get(clue_idx).cloned(),
    })
}

pub fn export_puz(puzzle: &PuzzleFile) -> anyhow::Result<Vec<u8>> {
    let size = puzzle.grid.size;
    let width = size as u8;
    let height = size as u8;
    let grid_size = size * size;

    // Build solution and state arrays
    let mut solution = vec![0u8; grid_size];
    let mut state = vec![0u8; grid_size];

    for row in 0..size {
        for col in 0..size {
            let cell = &puzzle.grid.cells[row][col];
            let idx = row * size + col;
            if cell.is_black {
                solution[idx] = b'.';
                state[idx] = b'.';
            } else {
                solution[idx] = cell.letter.unwrap_or('_') as u8;
                state[idx] = if cell.letter.is_some() { cell.letter.unwrap() as u8 } else { b'-' };
            }
        }
    }

    // Build clue strings in order (across/down interleaved by number)
    let mut working = puzzle.grid.clone();
    working.compute_numbers();
    let slots = working.get_slots();

    let mut clue_strings: Vec<String> = Vec::new();
    let across_map: std::collections::HashMap<u16, &ClueData> = puzzle.clues.across.iter().map(|c| (c.number, c)).collect();
    let down_map: std::collections::HashMap<u16, &ClueData> = puzzle.clues.down.iter().map(|c| (c.number, c)).collect();

    for slot in &slots {
        let clue_text = match slot.direction {
            Direction::Across => across_map.get(&slot.number).map(|c| c.text.as_str()).unwrap_or(""),
            Direction::Down => down_map.get(&slot.number).map(|c| c.text.as_str()).unwrap_or(""),
        };
        clue_strings.push(clue_text.to_string());
    }

    let num_clues = clue_strings.len() as u16;

    // Build the file
    let mut buf: Vec<u8> = Vec::new();

    // Header placeholder (52 bytes)
    buf.extend_from_slice(&[0u8; 52]);

    // Write header fields
    buf[0x02..0x0E].copy_from_slice(MAGIC);
    buf[0x18..0x1C].copy_from_slice(b"1.3\0");
    buf[0x2C] = width;
    buf[0x2D] = height;
    buf[0x2E..0x30].copy_from_slice(&num_clues.to_le_bytes());

    // Append solution and state
    buf.extend_from_slice(&solution);
    buf.extend_from_slice(&state);

    // Append strings (null-terminated)
    let strings = [
        puzzle.metadata.title.as_str(),
        puzzle.metadata.author.as_str(),
        puzzle.metadata.copyright.as_str(),
    ];
    for s in &strings {
        buf.extend_from_slice(s.as_bytes());
        buf.push(0);
    }
    for clue in &clue_strings {
        buf.extend_from_slice(clue.as_bytes());
        buf.push(0);
    }
    // Notes
    let notes = puzzle.notes.as_deref().unwrap_or("");
    buf.extend_from_slice(notes.as_bytes());
    buf.push(0);

    // Compute checksums
    let cib = compute_cib_checksum(&buf, grid_size);
    let overall = compute_overall_checksum(&buf, grid_size, &cib.to_le_bytes());
    buf[0x00..0x02].copy_from_slice(&overall.to_le_bytes());
    buf[0x0E..0x10].copy_from_slice(&cib.to_le_bytes());

    Ok(buf)
}

fn compute_cib_checksum(data: &[u8], _grid_size: usize) -> u16 {
    // CIB checksum is over bytes 0x2C-0x33 (8 bytes of header)
    let mut cksum = 0u16;
    for &b in &data[0x2C..0x34.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }
    cksum
}

fn compute_overall_checksum(data: &[u8], grid_size: usize, cib: &[u8]) -> u16 {
    let mut cksum = u16::from_le_bytes([cib[0], cib[1]]);

    // Add solution
    let sol_start = 52;
    let sol_end = sol_start + grid_size;
    for &b in &data[sol_start..sol_end.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }

    // Add state
    let state_end = sol_end + grid_size;
    for &b in &data[sol_end..state_end.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }

    cksum
}

fn parse_null_terminated_strings(data: &[u8], expected: usize) -> Vec<String> {
    let mut strings = Vec::with_capacity(expected);
    let mut start = 0;
    for _ in 0..expected {
        if start >= data.len() {
            strings.push(String::new());
            continue;
        }
        let end = data[start..].iter().position(|&b| b == 0).unwrap_or(data.len() - start);
        let s = String::from_utf8_lossy(&data[start..start + end]).to_string();
        strings.push(s);
        start += end + 1;
    }
    strings
}
