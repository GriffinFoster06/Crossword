/// CrossForge Word Database
///
/// Binary format: 4-byte magic "CWDB" + 4-byte version + 4-byte count,
/// then per-word: 1-byte length + 1-byte score + N bytes ASCII uppercase word.
///
/// In-memory index: for each word length bucket, a bitmap matrix indexed by
/// [position * 26 + (letter - 'A')] where each bit represents a word in that bucket.
/// Pattern matching = AND of bitmaps for each constrained position.

use std::collections::HashMap;
use std::path::Path;
use bitvec::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordEntry {
    pub word: String,
    pub score: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordMatch {
    pub word: String,
    pub score: u8,
    pub frequency_rank: u32,
}

struct LengthBucket {
    /// Words in this bucket, sorted by score descending at load time
    words: Vec<WordEntry>,
    /// Bitmap matrix: [pos * 26 + (letter - b'A')] → BitVec over word indices
    bitmaps: Vec<BitVec>,
    word_count: usize,
}

impl LengthBucket {
    fn new(mut words: Vec<WordEntry>) -> Self {
        words.sort_by(|a, b| b.score.cmp(&a.score));
        let word_count = words.len();
        let max_len = words.iter().map(|w| w.word.len()).max().unwrap_or(0);

        // Allocate bitmaps: max_len positions × 26 letters
        let bitmap_count = max_len * 26;
        let mut bitmaps: Vec<BitVec> = vec![bitvec![0; word_count]; bitmap_count];

        for (i, entry) in words.iter().enumerate() {
            for (pos, ch) in entry.word.bytes().enumerate() {
                if ch >= b'A' && ch <= b'Z' {
                    let bitmap_idx = pos * 26 + (ch - b'A') as usize;
                    if bitmap_idx < bitmaps.len() {
                        bitmaps[bitmap_idx].set(i, true);
                    }
                }
            }
        }

        Self { words, bitmaps, word_count }
    }

    /// Find all words matching `pattern` (uppercase, '_' = wildcard).
    /// Returns references sorted by score descending (natural order from init).
    fn find_matches(&self, pattern: &str) -> Vec<&WordEntry> {
        if self.word_count == 0 {
            return vec![];
        }

        // Start with all bits set
        let mut result: BitVec = bitvec![1; self.word_count];

        for (pos, ch) in pattern.bytes().enumerate() {
            if ch == b'_' || ch == b'.' || ch == b'?' {
                continue; // wildcard
            }
            if ch >= b'A' && ch <= b'Z' {
                let bitmap_idx = pos * 26 + (ch - b'A') as usize;
                if bitmap_idx < self.bitmaps.len() {
                    // AND with the bitmap for this (pos, letter)
                    let mask = &self.bitmaps[bitmap_idx];
                    result &= mask;
                } else {
                    // Position out of range for this bucket = no matches
                    return vec![];
                }
            }
        }

        result
            .iter_ones()
            .map(|i| &self.words[i])
            .collect()
    }
}

pub struct WordDatabase {
    /// Buckets keyed by word length (3..=21)
    buckets: HashMap<usize, LengthBucket>,
    total_words: usize,
}

impl WordDatabase {
    /// Load from our custom binary format.
    pub fn load_binary(path: &Path) -> anyhow::Result<Self> {
        use std::io::{Read, BufReader};
        let f = std::fs::File::open(path)?;
        let mut reader = BufReader::new(f);

        // Read header
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic)?;
        if &magic != b"CWDB" {
            anyhow::bail!("invalid word database magic");
        }

        let mut version_bytes = [0u8; 4];
        reader.read_exact(&mut version_bytes)?;
        let _version = u32::from_le_bytes(version_bytes);

        let mut count_bytes = [0u8; 4];
        reader.read_exact(&mut count_bytes)?;
        let count = u32::from_le_bytes(count_bytes) as usize;

        let mut by_length: HashMap<usize, Vec<WordEntry>> = HashMap::new();

        for _ in 0..count {
            let mut len_score = [0u8; 2];
            reader.read_exact(&mut len_score)?;
            let len = len_score[0] as usize;
            let score = len_score[1];

            let mut word_bytes = vec![0u8; len];
            reader.read_exact(&mut word_bytes)?;

            let word = String::from_utf8(word_bytes)?
                .to_uppercase();

            by_length.entry(len).or_default().push(WordEntry { word, score });
        }

        let total_words = by_length.values().map(|v| v.len()).sum();
        let buckets = by_length
            .into_iter()
            .map(|(len, words)| (len, LengthBucket::new(words)))
            .collect();

        Ok(Self { buckets, total_words })
    }

    /// Load from a plain text file: one word per line, optional score separated by ';'
    pub fn load_text(path: &Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let mut by_length: HashMap<usize, Vec<WordEntry>> = HashMap::new();

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let (word_raw, score) = if let Some((w, s)) = line.split_once(';') {
                let score = s.trim().parse::<u8>().unwrap_or(50);
                (w.trim(), score)
            } else {
                (line, 50u8)
            };

            let word: String = word_raw
                .chars()
                .filter(|c| c.is_alphabetic())
                .map(|c| c.to_ascii_uppercase())
                .collect();

            if word.len() >= 3 && word.len() <= 21 && word.is_ascii() {
                by_length.entry(word.len()).or_default().push(WordEntry { word, score });
            }
        }

        let total_words = by_length.values().map(|v| v.len()).sum();
        let buckets = by_length
            .into_iter()
            .map(|(len, words)| (len, LengthBucket::new(words)))
            .collect();

        Ok(Self { buckets, total_words })
    }

    /// Fallback minimal word list (built-in ~2000 common crossword words)
    pub fn load_fallback() -> Self {
        let words = include_str!("../../../resources/fallback_wordlist.txt");
        let mut by_length: HashMap<usize, Vec<WordEntry>> = HashMap::new();

        for line in words.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let (word_raw, score) = if let Some((w, s)) = line.split_once(';') {
                (w.trim(), s.trim().parse::<u8>().unwrap_or(50))
            } else {
                (line, 50u8)
            };

            let word: String = word_raw
                .chars()
                .filter(|c| c.is_alphabetic())
                .map(|c| c.to_ascii_uppercase())
                .collect();

            if word.len() >= 3 && word.len() <= 21 && word.is_ascii() {
                by_length.entry(word.len()).or_default().push(WordEntry { word, score });
            }
        }

        let total_words = by_length.values().map(|v| v.len()).sum();
        let buckets = by_length
            .into_iter()
            .map(|(len, words)| (len, LengthBucket::new(words)))
            .collect();

        Self { buckets, total_words }
    }

    /// Find all words of exact length matching pattern. Pattern must be uppercase
    /// with '_' as wildcard. Returns up to `limit` results sorted by score.
    pub fn find_matches(&self, pattern: &str, limit: usize) -> Vec<WordMatch> {
        let len = pattern.len();
        let pattern_upper = pattern.to_uppercase();

        let Some(bucket) = self.buckets.get(&len) else {
            return vec![];
        };

        bucket
            .find_matches(&pattern_upper)
            .into_iter()
            .take(limit)
            .enumerate()
            .map(|(rank, entry)| WordMatch {
                word: entry.word.clone(),
                score: entry.score,
                frequency_rank: rank as u32,
            })
            .collect()
    }

    /// Get all words of a given length (sorted by score), up to limit.
    pub fn words_for_length(&self, len: usize, min_score: u8) -> Vec<&WordEntry> {
        self.buckets
            .get(&len)
            .map(|b| {
                b.words
                    .iter()
                    .filter(|w| w.score >= min_score)
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn len(&self) -> usize {
        self.total_words
    }

    pub fn is_empty(&self) -> bool {
        self.total_words == 0
    }

    pub fn word_exists(&self, word: &str) -> bool {
        let w = word.to_uppercase();
        let len = w.len();
        self.buckets
            .get(&len)
            .map(|b| b.words.iter().any(|e| e.word == w))
            .unwrap_or(false)
    }

    pub fn get_score(&self, word: &str) -> Option<u8> {
        let w = word.to_uppercase();
        let len = w.len();
        self.buckets
            .get(&len)
            .and_then(|b| b.words.iter().find(|e| e.word == w))
            .map(|e| e.score)
    }
}
