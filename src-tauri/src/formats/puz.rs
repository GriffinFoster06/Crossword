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
/// Extensions (optional, after strings):
///   GRBS: rebus grid (1 byte/cell, 0=normal, N=1-based RTBL index)
///   RTBL: rebus table ("; N:WORD;" format)
///   GEXT: cell flags (bit 0x80=circled, bit 0x10=given)

use std::collections::HashMap;
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

    // Parse null-terminated strings block and find extensions offset
    let strings_data = &data[strings_start..];
    let (strings, strings_consumed) =
        parse_null_terminated_strings_with_len(strings_data, num_clues + 4); // title, author, copyright, clues..., notes

    let title = strings.first().cloned().unwrap_or_default();
    let author = strings.get(1).cloned().unwrap_or_default();
    let copyright = strings.get(2).cloned().unwrap_or_default();

    // Parse extension sections after strings
    let ext_start = strings_start + strings_consumed;
    let extensions = parse_extensions(&data[ext_start.min(data.len())..]);

    // Apply GRBS rebus
    let rtbl_map = parse_rtbl(extensions.get("RTBL").map(|v| v.as_slice()).unwrap_or(&[]));
    if let Some(grbs) = extensions.get("GRBS") {
        for row in 0..height {
            for col in 0..width {
                let idx = row * width + col;
                if idx < grbs.len() {
                    let rebus_idx = grbs[idx];
                    if rebus_idx > 0 {
                        if let Some(word) = rtbl_map.get(&rebus_idx) {
                            cells[row][col].rebus = Some(word.clone());
                            // Rebus first letter overrides single-letter from solution
                            cells[row][col].letter = word.chars().next();
                        }
                    }
                }
            }
        }
    }

    // Apply GEXT circles
    if let Some(gext) = extensions.get("GEXT") {
        for row in 0..height {
            for col in 0..width {
                let idx = row * width + col;
                if idx < gext.len() {
                    if gext[idx] & 0x80 != 0 {
                        cells[row][col].is_circled = true;
                    }
                }
            }
        }
    }

    let mut grid = GridState { size: width, cells };
    grid.compute_numbers();

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

    let notes = strings.get(clue_idx).cloned().filter(|s| !s.is_empty());

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
        notes,
    })
}

pub fn export_puz(puzzle: &PuzzleFile) -> anyhow::Result<Vec<u8>> {
    let size = puzzle.grid.size;
    let width = size as u8;
    let height = size as u8;
    let grid_size = size * size;

    // Collect rebus entries
    let mut rebus_map: HashMap<String, u8> = HashMap::new(); // word -> 1-based index
    let mut next_rebus_idx: u8 = 1;
    let mut grbs = vec![0u8; grid_size];
    let mut has_rebus = false;
    let mut gext = vec![0u8; grid_size];
    let mut has_circles = false;

    for row in 0..size {
        for col in 0..size {
            let cell = &puzzle.grid.cells[row][col];
            let idx = row * size + col;

            // Handle rebus
            if let Some(ref rebus_word) = cell.rebus {
                if rebus_word.len() > 1 {
                    has_rebus = true;
                    let entry = rebus_map.entry(rebus_word.clone()).or_insert_with(|| {
                        let i = next_rebus_idx;
                        next_rebus_idx += 1;
                        i
                    });
                    grbs[idx] = *entry;
                }
            }

            // Handle circles
            if cell.is_circled {
                has_circles = true;
                gext[idx] |= 0x80;
            }
        }
    }

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
                // For rebus, solution stores first letter only
                let letter = cell.effective_letter().unwrap_or('_') as u8;
                solution[idx] = letter;
                state[idx] = if cell.letter.is_some() || cell.rebus.is_some() { letter } else { b'-' };
            }
        }
    }

    // Build clue strings in order (across/down interleaved by number)
    let mut working = puzzle.grid.clone();
    working.compute_numbers();
    let slots = working.get_slots();

    let mut clue_strings: Vec<String> = Vec::new();
    let across_map: HashMap<u16, &ClueData> =
        puzzle.clues.across.iter().map(|c| (c.number, c)).collect();
    let down_map: HashMap<u16, &ClueData> =
        puzzle.clues.down.iter().map(|c| (c.number, c)).collect();

    for slot in &slots {
        let clue_text = match slot.direction {
            Direction::Across => across_map.get(&slot.number).map(|c| c.text.as_str()).unwrap_or(""),
            Direction::Down => down_map.get(&slot.number).map(|c| c.text.as_str()).unwrap_or(""),
        };
        clue_strings.push(clue_text.to_string());
    }

    let num_clues = clue_strings.len() as u16;

    // Build the main file
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
    let header_strings = [
        puzzle.metadata.title.as_str(),
        puzzle.metadata.author.as_str(),
        puzzle.metadata.copyright.as_str(),
    ];
    for s in &header_strings {
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

    // Write extension sections
    if has_rebus {
        // GRBS section
        write_extension(&mut buf, b"GRBS", &grbs);

        // RTBL section: "; 1:WORD; 2:WORD2;" format
        let mut rtbl_entries: Vec<(u8, &String)> = rebus_map.iter().map(|(k, &v)| (v, k)).collect();
        rtbl_entries.sort_by_key(|(i, _)| *i);
        let mut rtbl_data = Vec::new();
        for (idx, word) in rtbl_entries {
            let entry = format!(" {:2}:{};", idx, word);
            rtbl_data.extend_from_slice(entry.as_bytes());
        }
        write_extension(&mut buf, b"RTBL", &rtbl_data);
    }

    if has_circles {
        write_extension(&mut buf, b"GEXT", &gext);
    }

    Ok(buf)
}

/// Write a .puz extension section: 4-char name + u16 len + u16 checksum + data + null
fn write_extension(buf: &mut Vec<u8>, name: &[u8; 4], data: &[u8]) {
    let data_len = data.len() as u16;
    let cksum = compute_extension_checksum(data);
    buf.extend_from_slice(name);
    buf.extend_from_slice(&data_len.to_le_bytes());
    buf.extend_from_slice(&cksum.to_le_bytes());
    buf.extend_from_slice(data);
    buf.push(0); // null terminator
}

fn compute_extension_checksum(data: &[u8]) -> u16 {
    let mut cksum = 0u16;
    for &b in data {
        cksum = if cksum & 1 != 0 { (cksum >> 1) | 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }
    cksum
}

/// Parse extension sections. Returns map of name -> data bytes.
fn parse_extensions(data: &[u8]) -> HashMap<String, Vec<u8>> {
    let mut map = HashMap::new();
    let mut pos = 0;
    while pos + 8 <= data.len() {
        let name = String::from_utf8_lossy(&data[pos..pos + 4]).to_string();
        let data_len = u16::from_le_bytes([data[pos + 4], data[pos + 5]]) as usize;
        // pos+6..pos+8 is checksum (skip validation for now)
        let data_start = pos + 8;
        let data_end = data_start + data_len;
        if data_end > data.len() {
            break;
        }
        map.insert(name, data[data_start..data_end].to_vec());
        pos = data_end + 1; // skip null terminator
    }
    map
}

/// Parse RTBL data into a map: 1-based index -> rebus word
fn parse_rtbl(data: &[u8]) -> HashMap<u8, String> {
    let mut map = HashMap::new();
    let s = String::from_utf8_lossy(data);
    // Format: " 1:WORD; 2:WORD2;" — split by ';'
    for entry in s.split(';') {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        if let Some(colon) = entry.find(':') {
            let idx_str = entry[..colon].trim();
            let word = entry[colon + 1..].trim();
            if let Ok(idx) = idx_str.parse::<u8>() {
                map.insert(idx, word.to_uppercase());
            }
        }
    }
    map
}

fn compute_cib_checksum(data: &[u8], _grid_size: usize) -> u16 {
    let mut cksum = 0u16;
    for &b in &data[0x2C..0x34.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }
    cksum
}

fn compute_overall_checksum(data: &[u8], grid_size: usize, cib: &[u8]) -> u16 {
    let mut cksum = u16::from_le_bytes([cib[0], cib[1]]);

    let sol_start = 52;
    let sol_end = sol_start + grid_size;
    for &b in &data[sol_start..sol_end.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }

    let state_end = sol_end + grid_size;
    for &b in &data[sol_end..state_end.min(data.len())] {
        cksum = if cksum & 1 != 0 { (cksum >> 1) + 0x8000 } else { cksum >> 1 };
        cksum = cksum.wrapping_add(b as u16);
    }

    cksum
}

/// Returns (strings, bytes_consumed) so caller knows where extensions start.
fn parse_null_terminated_strings_with_len(data: &[u8], expected: usize) -> (Vec<String>, usize) {
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
    (strings, start)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::json::{PuzzleFile, PuzzleMetadata, PuzzleClues, ClueData};
    use crate::engine::grid::{GridState, Direction};

    fn make_minimal_puzzle(size: usize) -> PuzzleFile {
        let mut grid = GridState::new(size);
        // Fill all cells with 'A' so every slot is complete
        for r in 0..size {
            for c in 0..size {
                grid.set_letter(r, c, Some('A'));
            }
        }
        grid.compute_numbers();
        let slots = grid.get_slots();

        let across_clues: Vec<ClueData> = slots.iter()
            .filter(|s| s.direction == Direction::Across)
            .map(|s| ClueData {
                number: s.number,
                text: format!("{}-Across clue", s.number),
                answer: s.pattern.replace('_', "A"),
                is_theme_entry: false,
            })
            .collect();

        let down_clues: Vec<ClueData> = slots.iter()
            .filter(|s| s.direction == Direction::Down)
            .map(|s| ClueData {
                number: s.number,
                text: format!("{}-Down clue", s.number),
                answer: s.pattern.replace('_', "A"),
                is_theme_entry: false,
            })
            .collect();

        PuzzleFile {
            version: 1,
            metadata: PuzzleMetadata {
                title: "Test Puzzle".to_string(),
                author: "Tester".to_string(),
                editor: String::new(),
                copyright: String::new(),
                date: None,
                difficulty: None,
                notes: None,
            },
            grid,
            clues: PuzzleClues { across: across_clues, down: down_clues },
            theme: None,
            notes: None,
        }
    }

    #[test]
    fn test_puz_roundtrip_3x3() {
        let puzzle = make_minimal_puzzle(3);
        let bytes = export_puz(&puzzle).expect("export should succeed");

        // Check magic bytes
        assert_eq!(&bytes[0x02..0x0E], b"ACROSS&DOWN\0");

        let imported = import_puz(&bytes).expect("import should succeed");
        assert_eq!(imported.metadata.title, "Test Puzzle");
        assert_eq!(imported.metadata.author, "Tester");
        assert_eq!(imported.grid.size, 3);

        // All cells should be white (not black) and have letter 'A'
        for row in &imported.grid.cells {
            for cell in row {
                assert!(!cell.is_black);
                assert_eq!(cell.letter, Some('A'));
            }
        }
    }

    #[test]
    fn test_puz_roundtrip_clue_count() {
        let puzzle = make_minimal_puzzle(3);
        let bytes = export_puz(&puzzle).expect("export should succeed");
        let imported = import_puz(&bytes).expect("import should succeed");

        // Clue counts must match original
        assert_eq!(imported.clues.across.len(), puzzle.clues.across.len());
        assert_eq!(imported.clues.down.len(), puzzle.clues.down.len());
    }

    #[test]
    fn test_puz_black_cells_roundtrip() {
        let mut puzzle = make_minimal_puzzle(5);
        // Make corner cells black
        puzzle.grid.cells[0][0].is_black = true;
        puzzle.grid.cells[0][0].letter = None;
        puzzle.grid.cells[4][4].is_black = true;
        puzzle.grid.cells[4][4].letter = None;

        let bytes = export_puz(&puzzle).expect("export should succeed");
        let imported = import_puz(&bytes).expect("import should succeed");

        assert!(imported.grid.cells[0][0].is_black);
        assert!(imported.grid.cells[4][4].is_black);
        assert!(!imported.grid.cells[0][1].is_black);
    }
}
