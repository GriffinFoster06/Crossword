#!/usr/bin/env python3
"""
CrossForge Clue Database Builder
---------------------------------
Parses open-licensed crossword puzzle data (xd corpus, Kaggle datasets)
and compiles a SQLite database of historical clue/answer pairs.

Usage:
    python3 scripts/build-cluedb.py --xd-dir data/clues/xd --output resources/clues.db
    python3 scripts/build-cluedb.py --csv data/clues/nyt_crosswords.csv --output resources/clues.db

Sources:
  - xd corpus:  https://github.com/century-arcade/xd  (CC-BY-SA licensed)
  - Kaggle NYT:  https://www.kaggle.com/datasets/darinhawley/new-york-times-crossword-clues-answers-19932021
"""

import argparse
import csv
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Iterator

# ─── Schema ──────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS clues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    answer      TEXT    NOT NULL,
    clue        TEXT    NOT NULL,
    source      TEXT,
    year        INTEGER,
    day_of_week TEXT,
    difficulty  TEXT,
    constructor TEXT,
    puzzle_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_clues_answer ON clues (answer);
CREATE INDEX IF NOT EXISTS idx_clues_source_year ON clues (source, year);
"""

DAY_NAMES = {
    0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday',
    4: 'Friday', 5: 'Saturday', 6: 'Sunday',
}

DIFFICULTY_BY_DAY = {
    'Monday': 'easy', 'Tuesday': 'easy-medium', 'Wednesday': 'medium',
    'Thursday': 'medium-hard', 'Friday': 'hard', 'Saturday': 'hard',
    'Sunday': 'hard',
}


# ─── Parsers ─────────────────────────────────────────────────────────────────

def parse_xd_file(path: Path) -> Iterator[dict]:
    """Parse a single .xd file (xd corpus format)."""
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        print(f"  Warning: could not read {path}: {e}", file=sys.stderr)
        return

    # Extract headers
    headers = {}
    lines = text.split('\n')
    body_start = 0
    for i, line in enumerate(lines):
        if line.startswith('##'):
            break
        if ':' in line:
            key, _, val = line.partition(':')
            headers[key.strip().lower()] = val.strip()
            body_start = i + 1

    title = headers.get('title', '')
    date_str = headers.get('date', '')
    constructor = headers.get('author', headers.get('constructor', ''))
    year = None
    day_of_week = None
    difficulty = None

    if date_str:
        parts = date_str.split('-')
        if parts:
            try:
                year = int(parts[0])
            except ValueError:
                pass

    # Try to extract day of week from title or date
    for day in DAY_NAMES.values():
        if day.lower() in title.lower():
            day_of_week = day
            difficulty = DIFFICULTY_BY_DAY.get(day)
            break

    # Find clue section
    in_clues = False
    for line in lines[body_start:]:
        line = line.strip()
        if line in ('A', 'ACROSS', 'Across') or line.startswith('A.') or line == 'Across:':
            in_clues = True
            continue
        if line in ('D', 'DOWN', 'Down') or line.startswith('D.') or line == 'Down:':
            in_clues = True
            continue
        if not in_clues:
            continue

        # Pattern: "1A. ANSWER ~ Clue text"  or "1. Clue ~ ANSWER"
        # xd format uses tilde to separate answer from clue
        m = re.match(r'^\d+[AD]?\.\s+(.+?)\s*~\s*(.+)$', line, re.IGNORECASE)
        if m:
            left, right = m.group(1).strip(), m.group(2).strip()
            # Determine which is answer vs clue — answer is all-caps
            if left.isupper() and len(left) >= 2:
                answer, clue = left, right
            elif right.isupper() and len(right) >= 2:
                answer, clue = right, left
            else:
                # Assume left is answer if mostly uppercase
                upper_ratio = sum(1 for c in left if c.isupper()) / max(len(left), 1)
                if upper_ratio > 0.7:
                    answer, clue = left, right
                else:
                    continue

            answer = answer.upper().replace(' ', '')
            if not answer.isalpha() or len(answer) < 2:
                continue

            yield {
                'answer': answer,
                'clue': clue,
                'source': 'xd',
                'year': year,
                'day_of_week': day_of_week,
                'difficulty': difficulty,
                'constructor': constructor or None,
                'puzzle_date': date_str or None,
            }


def parse_xd_directory(xd_dir: Path) -> Iterator[dict]:
    """Recursively parse all .xd files in a directory."""
    files = list(xd_dir.rglob('*.xd'))
    total = len(files)
    print(f"  Found {total} .xd files in {xd_dir}")
    for i, path in enumerate(files):
        if i % 1000 == 0 and i > 0:
            print(f"  Parsed {i}/{total} files...", file=sys.stderr)
        yield from parse_xd_file(path)


def parse_csv_kaggle(csv_path: Path) -> Iterator[dict]:
    """
    Parse Kaggle-style CSV with columns:
    Date, Day, Clue, Answer  (or similar)
    Handles multiple common CSV schemas.
    """
    print(f"  Parsing CSV: {csv_path}")
    with open(csv_path, encoding='utf-8', errors='replace', newline='') as f:
        reader = csv.DictReader(f)
        headers = [h.lower().strip() for h in (reader.fieldnames or [])]

        # Detect column names
        answer_col = next((h for h in headers if 'answer' in h), None)
        clue_col = next((h for h in headers if 'clue' in h), None)
        date_col = next((h for h in headers if 'date' in h), None)
        day_col = next((h for h in headers if 'day' in h), None)
        author_col = next((h for h in headers if 'author' in h or 'constructor' in h), None)

        if not answer_col or not clue_col:
            print(f"  Error: CSV must have 'answer' and 'clue' columns. Found: {headers}")
            return

        for row in reader:
            # Normalize keys to lowercase
            row = {k.lower().strip(): v for k, v in row.items()}

            answer = row.get(answer_col, '').strip().upper().replace(' ', '')
            clue = row.get(clue_col, '').strip()

            if not answer.isalpha() or len(answer) < 2 or not clue:
                continue

            date_str = row.get(date_col, '') if date_col else ''
            day = row.get(day_col, '') if day_col else ''
            constructor = row.get(author_col, '') if author_col else ''

            year = None
            if date_str:
                m = re.search(r'\b(19|20)\d{2}\b', date_str)
                if m:
                    year = int(m.group())

            day_of_week = day if day in DAY_NAMES.values() else None
            difficulty = DIFFICULTY_BY_DAY.get(day_of_week) if day_of_week else None

            yield {
                'answer': answer,
                'clue': clue,
                'source': 'kaggle',
                'year': year,
                'day_of_week': day_of_week,
                'difficulty': difficulty,
                'constructor': constructor or None,
                'puzzle_date': date_str or None,
            }


# ─── Database writer ──────────────────────────────────────────────────────────

def build_database(records: Iterator[dict], output_path: Path, dedup: bool = True):
    """Write records to SQLite, optionally deduplicating answer+clue pairs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists():
        output_path.unlink()

    conn = sqlite3.connect(str(output_path))
    conn.executescript(SCHEMA)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')

    seen: set[tuple] = set()
    inserted = 0
    skipped = 0

    batch = []
    BATCH_SIZE = 5000

    for rec in records:
        key = (rec['answer'], rec['clue'])
        if dedup and key in seen:
            skipped += 1
            continue
        seen.add(key)

        batch.append((
            rec['answer'],
            rec['clue'],
            rec.get('source'),
            rec.get('year'),
            rec.get('day_of_week'),
            rec.get('difficulty'),
            rec.get('constructor'),
            rec.get('puzzle_date'),
        ))
        inserted += 1

        if len(batch) >= BATCH_SIZE:
            conn.executemany(
                'INSERT INTO clues (answer,clue,source,year,day_of_week,difficulty,constructor,puzzle_date) VALUES (?,?,?,?,?,?,?,?)',
                batch
            )
            conn.commit()
            batch.clear()
            if inserted % 50000 == 0:
                print(f"  {inserted:,} clues inserted...")

    if batch:
        conn.executemany(
            'INSERT INTO clues (answer,clue,source,year,day_of_week,difficulty,constructor,puzzle_date) VALUES (?,?,?,?,?,?,?,?)',
            batch
        )
        conn.commit()

    # Optimize
    conn.execute('ANALYZE')
    conn.execute('VACUUM')
    conn.close()

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\nDatabase built: {output_path}")
    print(f"  {inserted:,} unique clues inserted")
    print(f"  {skipped:,} duplicates skipped")
    print(f"  Size: {size_mb:.1f} MB")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Build CrossForge clue database')
    ap.add_argument('--xd-dir', type=Path, help='Directory containing .xd corpus files')
    ap.add_argument('--csv', type=Path, action='append', default=[], help='CSV file(s) to import (can specify multiple)')
    ap.add_argument('--output', type=Path, default=Path('resources/clues.db'), help='Output SQLite path')
    ap.add_argument('--no-dedup', action='store_true', help='Skip deduplication (faster but larger DB)')
    args = ap.parse_args()

    if not args.xd_dir and not args.csv:
        print("Error: specify at least one of --xd-dir or --csv", file=sys.stderr)
        print("\nExample usage:")
        print("  # Download xd corpus first:")
        print("  git clone https://github.com/century-arcade/xd data/clues/xd")
        print("  # Then build:")
        print("  python3 scripts/build-cluedb.py --xd-dir data/clues/xd --output resources/clues.db")
        sys.exit(1)

    def all_records():
        if args.xd_dir:
            if not args.xd_dir.exists():
                print(f"Error: --xd-dir {args.xd_dir} does not exist", file=sys.stderr)
                sys.exit(1)
            yield from parse_xd_directory(args.xd_dir)
        for csv_path in args.csv:
            if not csv_path.exists():
                print(f"Error: CSV file {csv_path} does not exist", file=sys.stderr)
                sys.exit(1)
            yield from parse_csv_kaggle(csv_path)

    print(f"Building clue database → {args.output}")
    build_database(all_records(), args.output, dedup=not args.no_dedup)


if __name__ == '__main__':
    main()
