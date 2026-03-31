/// CrossForge native JSON puzzle format.
///
/// Stores the complete puzzle state including grid, clues, metadata,
/// theme info, and AI conversation history.

use serde::{Serialize, Deserialize};
use crate::engine::grid::GridState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleFile {
    pub version: u32,
    pub metadata: PuzzleMetadata,
    pub grid: GridState,
    pub clues: PuzzleClues,
    pub theme: Option<ThemeData>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleMetadata {
    pub title: String,
    pub author: String,
    pub editor: String,
    pub copyright: String,
    pub date: Option<String>,
    pub difficulty: Option<String>, // "Monday"–"Saturday"
    pub notes: Option<String>,
}

impl Default for PuzzleMetadata {
    fn default() -> Self {
        Self {
            title: String::new(),
            author: String::new(),
            editor: String::new(),
            copyright: String::new(),
            date: None,
            difficulty: None,
            notes: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClueData {
    pub number: u16,
    pub text: String,
    pub answer: String,
    pub is_theme_entry: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PuzzleClues {
    pub across: Vec<ClueData>,
    pub down: Vec<ClueData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeData {
    pub description: String,
    pub entries: Vec<String>,
    pub revealer: Option<String>,
    pub theme_type: Option<String>, // "add-a-letter", "hidden-word", "rebus", etc.
}

impl PuzzleFile {
    pub fn new(size: usize) -> Self {
        Self {
            version: 1,
            metadata: PuzzleMetadata::default(),
            grid: GridState::new(size),
            clues: PuzzleClues::default(),
            theme: None,
            notes: None,
        }
    }

    pub fn save_to_string(&self) -> serde_json::Result<String> {
        serde_json::to_string_pretty(self)
    }

    pub fn load_from_string(s: &str) -> serde_json::Result<Self> {
        serde_json::from_str(s)
    }

    pub fn save_to_file(&self, path: &std::path::Path) -> anyhow::Result<()> {
        let json = self.save_to_string()?;
        std::fs::write(path, json)?;
        Ok(())
    }

    pub fn load_from_file(path: &std::path::Path) -> anyhow::Result<Self> {
        let json = std::fs::read_to_string(path)?;
        let puzzle = Self::load_from_string(&json)?;
        Ok(puzzle)
    }
}
