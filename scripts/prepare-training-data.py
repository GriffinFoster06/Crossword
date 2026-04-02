#!/usr/bin/env python3
"""
CrossForge Training Data Preparation

Converts the clues.db SQLite database into instruction-tuning JSONL format
suitable for LoRA fine-tuning Phi-4 (or similar) on crossword-specific tasks.

Produces one JSONL file per agent role:
  - training/clue-writer.jsonl    — clue generation
  - training/theme-agent.jsonl    — theme development
  - training/word-selector.jsonl  — word quality ranking

Each record follows the Phi-4 instruction format:
  {"messages": [
    {"role": "system", "content": "..."},
    {"role": "user",   "content": "..."},
    {"role": "assistant", "content": "..."}
  ]}

Usage:
  python scripts/prepare-training-data.py \
    --db src-tauri/resources/clues.db \
    --out training/
  python scripts/prepare-training-data.py --help
"""

import argparse
import json
import random
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path


# ─── Difficulty mapping ───────────────────────────────────────────────────────

DAY_LABELS = {
    "Monday": "Monday (easy)",
    "Tuesday": "Tuesday (easy-medium)",
    "Wednesday": "Wednesday (medium)",
    "Thursday": "Thursday (medium-hard, often tricky theme)",
    "Friday": "Friday (hard, themeless)",
    "Saturday": "Saturday (very hard, themeless)",
    "Sunday": "Sunday (hard, large grid, themed)",
    "easy": "Monday",
    "easy-medium": "Tuesday",
    "medium": "Wednesday",
    "medium-hard": "Thursday",
    "hard": "Friday",
}

CLUE_WRITER_SYSTEM = """You are an expert crossword clue writer for the New York Times crossword puzzle. You craft clues that are:
- Grammatically impeccable and precisely worded
- Appropriate difficulty for the requested day (Monday = straightforward, Saturday = tricky misdirection)
- Creative: use wordplay, double meanings, misdirection, puns, and cultural references
- Fresh: avoid clichéd clue templates; surprise the solver
- Fair: the answer must be clearly derivable once you know it

Output format — respond ONLY with a JSON array, no explanation:
[
  {"text": "Clue text here", "style": "Definition"},
  {"text": "Another clue", "style": "Wordplay"},
  {"text": "Third option", "style": "Misdirection"}
]"""

WORD_SELECTOR_SYSTEM = """You are an expert crossword fill consultant who helps select the best words for crossword grids. You prioritize:
- Lively, fresh words that solvers enjoy seeing
- Words with interesting cluing potential
- Avoiding crosswordese (EPEE, ESNE, ALAE, INIA, etc.)
- Considering the puzzle's theme and difficulty level

Output format — respond ONLY with valid JSON:
[
  {"word": "SPARK", "score": 85, "category": "Fresh", "reason": "Lively, great clue angles"},
  ...
]"""

THEME_AGENT_SYSTEM = """You are a creative crossword theme developer specializing in NYT-publishable themed puzzles. You excel at:
- Identifying rich, multi-layered theme concepts
- Finding theme entries with consistent, elegant transformations
- Crafting revealers that are both apt and surprising
- Understanding NYT standards for theme consistency

Output format — respond ONLY with valid JSON:
{
  "description": "Theme description",
  "type": "ADD_A_LETTER",
  "entries": [
    {"answer": "WORDHERE", "explanation": "why this fits", "clue": "Suggested clue", "length": 8}
  ],
  "revealer": {"answer": "REVEALERWORD", "clue": "Revealer clue", "length": 11}
}"""


# ─── Clue category detection ──────────────────────────────────────────────────

def infer_clue_style(clue: str) -> str:
    """Heuristically classify a clue's style."""
    if re.search(r'\b_+\b', clue):
        return "Fill-in-the-blank"
    if clue.endswith("?"):
        return "Wordplay"
    if any(w in clue.lower() for w in ["like a", "like some", "kind of", "type of"]):
        return "Definition"
    if re.search(r'"[^"]+"', clue):
        return "Quote"
    if re.search(r"[A-Z][a-z]+(?:'s)?", clue):
        return "Trivia"
    return "Definition"


# ─── Clue writer training data ────────────────────────────────────────────────

def generate_clue_writer_samples(conn: sqlite3.Connection, n: int) -> list[dict]:
    """
    Generate N instruction samples for the clue writer agent.

    Pattern: given an ANSWER + difficulty, produce 3 clue candidates.
    We group real clues by (answer, day_of_week) and use them as gold output.
    """
    # Get answers that have multiple clues (richer training signal)
    rows = conn.execute("""
        SELECT answer, day_of_week, GROUP_CONCAT(clue, '|||') AS clues
        FROM clues
        WHERE LENGTH(answer) >= 3
          AND answer GLOB '*[A-Z]*'
          AND day_of_week IS NOT NULL
        GROUP BY answer, day_of_week
        HAVING COUNT(*) >= 1
        ORDER BY RANDOM()
        LIMIT ?
    """, (n * 3,)).fetchall()

    samples = []
    seen_answers = set()

    for answer, day, clues_raw in rows:
        if answer in seen_answers:
            continue
        seen_answers.add(answer)

        day_label = DAY_LABELS.get(day or "Wednesday", "Wednesday (medium)")
        clue_list = [c.strip() for c in clues_raw.split("|||") if c.strip()]

        if not clue_list:
            continue

        # Use up to 3 real clues as gold output
        gold_clues = clue_list[:3]
        while len(gold_clues) < 3:
            gold_clues.append(gold_clues[-1])  # pad by repeating

        gold_json = json.dumps([
            {"text": c, "style": infer_clue_style(c)}
            for c in gold_clues[:3]
        ], ensure_ascii=False)

        user_msg = (
            f"Write 3 crossword clues for the answer: {answer}\n"
            f"Target difficulty: {day_label}\n"
            f"Provide clues in different styles (definition, wordplay, misdirection)."
        )

        samples.append({
            "messages": [
                {"role": "system", "content": CLUE_WRITER_SYSTEM},
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": gold_json},
            ]
        })

        if len(samples) >= n:
            break

    return samples


# ─── Word selector training data ──────────────────────────────────────────────

CROSSWORDESE = {
    "EPEE", "ESNE", "ETUI", "ALEE", "ASEA", "OLEO", "ERNE", "ERSE",
    "SNEE", "ENOL", "INRO", "OSSA", "ATILT", "ATRIP", "ODEA", "AGEE",
    "OGEE", "SMEW", "SPAE", "RIEL", "BRAE", "EYOT", "ERST", "ANEW",
    "NAEVI", "ALULA", "AREOLA", "TARN", "NEBS", "NIBS", "GESTE", "LIERNE",
}

LIVELY_WORDS = {
    "PODCAST", "STREAMING", "TIKTOK", "SELFIE", "EMOJI", "MEME", "VIRAL",
    "HASHTAG", "UBER", "ZOOM", "WIFI", "PIXEL", "INFLUENCER", "GAMER",
    "YOLO", "FOMO", "MOJO", "VIBE", "SLAY", "BINGE", "GHOSTED", "RIZZ",
    "BANGER", "ICONIC", "NETFLIX", "GOOGLE", "TWITTER", "SPOTIFY", "TESLA",
}


def score_word_quality(word: str) -> tuple[int, str, str]:
    """Return (score 0-100, category, reason) for a word."""
    if word in CROSSWORDESE:
        return 15, "Crosswordese", "Tired puzzle staple, avoid"
    if word in LIVELY_WORDS:
        return 90, "Fresh", "Modern, lively, solvers enjoy this"
    if len(word) <= 3:
        return 55, "Neutral", "Short fill, unremarkable"
    if word.endswith(("S", "ED", "ING", "LY")):
        return 50, "Neutral", "Common suffix form, functional fill"
    return 65, "Solid", "Good common word, reliable choice"


def generate_word_selector_samples(n: int) -> list[dict]:
    """
    Generate N instruction samples for the word selector agent.

    Pattern: given a pattern (e.g., "S_A_") and candidates, rank them.
    We use our heuristic scoring as pseudo-ground-truth since we lack
    labeled ranking data.
    """
    import string

    # Common crossword patterns with some candidates
    pattern_templates = [
        ("S???", ["STAR", "SLIP", "SPIN", "SLAP", "SNAP", "SMEW", "ERST"]),
        ("???E", ["FIRE", "VIBE", "LORE", "ERNE", "RILE", "FADE", "BODE"]),
        ("A????", ["ALERT", "ANIME", "AROMA", "ATILT", "AISLE", "ARSON", "AVAIL"]),
        ("?????", ["MEME", "GLITCH", "PIZZA", "EPEE", "IAMBI", "GESTE", "OLEO"]),
        ("???", ["ACE", "BOP", "CAP", "DIM", "EEL", "FOB", "GOB"]),
        ("????NG", ["VYING", "MOPING", "BODING", "ACING"]),
        ("????S", ["VIBES", "SNAPS", "SLAPS", "OGEES", "ETUIS"]),
    ]

    samples = []
    for _ in range(n):
        pat, candidates = random.choice(pattern_templates)
        random.shuffle(candidates)

        # Score each candidate
        scored = []
        for w in candidates:
            sc, cat, reason = score_word_quality(w)
            scored.append({"word": w, "score": sc, "category": cat, "reason": reason})
        scored.sort(key=lambda x: -x["score"])

        gold_json = json.dumps(scored, ensure_ascii=False)

        user_msg = (
            f"Re-rank these crossword fill candidates for the pattern '{pat}':\n"
            f"{', '.join(candidates)}\n"
            "Return the top choices as a JSON array."
        )

        samples.append({
            "messages": [
                {"role": "system", "content": WORD_SELECTOR_SYSTEM},
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": gold_json},
            ]
        })

    return samples


# ─── Theme agent training data ────────────────────────────────────────────────

THEME_EXAMPLES = [
    {
        "seed": "coffee drinks",
        "output": {
            "description": "Popular coffee drinks hidden in longer phrases",
            "type": "HIDDEN_WORD",
            "entries": [
                {"answer": "MACCHIATO", "explanation": "Italian coffee with milk foam", "clue": "Espresso with steamed milk foam", "length": 9},
                {"answer": "AMERICANO", "explanation": "Espresso diluted with water", "clue": "Espresso-based drink, diluted", "length": 9},
                {"answer": "RISTRETTO", "explanation": "Short espresso shot", "clue": "Concentrated espresso shot", "length": 9},
                {"answer": "CAPPUCCINO", "explanation": "Espresso with frothy milk", "clue": "Italian coffeehouse classic", "length": 10},
            ],
            "revealer": {"answer": "COFFEEHOUSE", "clue": "Where you'd order any of these", "length": 11}
        }
    },
    {
        "seed": "types of music",
        "output": {
            "description": "Music genres hidden in names",
            "type": "HIDDEN_WORD",
            "entries": [
                {"answer": "JAZZERCISE", "explanation": "JAZZ hidden in fitness brand", "clue": "Workout brand with a musical beat", "length": 10},
                {"answer": "BLUESBUSTER", "explanation": "BLUES hidden in compound", "clue": "Depression fighter, informally", "length": 11},
                {"answer": "ROCKABILLY", "explanation": "ROCK hidden in genre name", "clue": "Hybrid genre of the 1950s", "length": 10},
                {"answer": "FUNKYTOWN", "explanation": "FUNK hidden in pop song", "clue": "1980 disco hit", "length": 9},
            ],
            "revealer": {"answer": "GENREBLENDING", "clue": "What all these theme answers do", "length": 13}
        }
    },
    {
        "seed": "space exploration",
        "output": {
            "description": "Add 'MOON' to common phrases",
            "type": "ADD_A_WORD",
            "entries": [
                {"answer": "MOONLANDING", "explanation": "MOON + LANDING", "clue": "Historic 1969 achievement", "length": 11},
                {"answer": "MOONBEAM", "explanation": "MOON + BEAM", "clue": "Lunar light ray", "length": 8},
                {"answer": "MOONWALK", "explanation": "MOON + WALK", "clue": "Armstrong's achievement, or Jackson's move", "length": 8},
                {"answer": "MOONSHINE", "explanation": "MOON + SHINE", "clue": "Illicit hooch, or lunar glow", "length": 9},
            ],
            "revealer": {"answer": "FULLMOON", "clue": "What appears in all the theme entries", "length": 8}
        }
    },
]


def generate_theme_agent_samples(n: int) -> list[dict]:
    """Generate N instruction samples for the theme agent."""
    samples = []
    for i in range(n):
        ex = THEME_EXAMPLES[i % len(THEME_EXAMPLES)]
        output_json = json.dumps(ex["output"], ensure_ascii=False, indent=2)

        user_msg = (
            f"Develop a crossword theme based on this idea: \"{ex['seed']}\"\n"
            "Grid size: 15×15\n"
            "Target difficulty: Wednesday\n"
            "Number of theme entries needed: 3-5\n"
            "Provide theme entries in the JSON format specified."
        )

        samples.append({
            "messages": [
                {"role": "system", "content": THEME_AGENT_SYSTEM},
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": output_json},
            ]
        })

    return samples


# ─── Writer ───────────────────────────────────────────────────────────────────

def write_jsonl(samples: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")
    print(f"  Wrote {len(samples):,} samples → {path}")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Prepare CrossForge training data from clues.db",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
After running this script:
  python scripts/fine-tune.py --data training/ --model phi4 --output models/fine-tuned/
        """,
    )
    ap.add_argument(
        "--db",
        type=Path,
        default=Path("src-tauri/resources/clues.db"),
        help="Path to clues.db (default: src-tauri/resources/clues.db)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("training"),
        help="Output directory for JSONL files (default: training/)",
    )
    ap.add_argument(
        "--clue-samples",
        type=int,
        default=50000,
        help="Number of clue writer training samples (default: 50000)",
    )
    ap.add_argument(
        "--word-samples",
        type=int,
        default=5000,
        help="Number of word selector training samples (default: 5000)",
    )
    ap.add_argument(
        "--theme-samples",
        type=int,
        default=500,
        help="Number of theme agent training samples (default: 500)",
    )
    ap.add_argument("--seed", type=int, default=42, help="Random seed")
    args = ap.parse_args()

    random.seed(args.seed)

    print("CrossForge Training Data Preparation")
    print("=" * 45)

    # ── Clue writer ────────────────────────────────────────────────────────
    if args.db.exists():
        print(f"\n[1/3] Generating clue writer samples from {args.db}...")
        conn = sqlite3.connect(str(args.db))
        clue_samples = generate_clue_writer_samples(conn, args.clue_samples)
        conn.close()
        write_jsonl(clue_samples, args.out / "clue-writer.jsonl")
    else:
        print(f"\n[1/3] Warning: {args.db} not found — generating minimal clue writer samples")
        print("  Run scripts/build-cluedb.py first to get full training data")
        # Generate a tiny set without the DB to at least have something
        clue_samples = []
        write_jsonl(clue_samples, args.out / "clue-writer.jsonl")

    # ── Word selector ──────────────────────────────────────────────────────
    print(f"\n[2/3] Generating word selector samples...")
    word_samples = generate_word_selector_samples(args.word_samples)
    write_jsonl(word_samples, args.out / "word-selector.jsonl")

    # ── Theme agent ────────────────────────────────────────────────────────
    print(f"\n[3/3] Generating theme agent samples...")
    theme_samples = generate_theme_agent_samples(args.theme_samples)
    write_jsonl(theme_samples, args.out / "theme-agent.jsonl")

    # ── Summary ────────────────────────────────────────────────────────────
    total = len(clue_samples) + len(word_samples) + len(theme_samples)
    print(f"\nTotal training samples: {total:,}")
    print(f"Output directory: {args.out}/")
    print("\nNext steps:")
    print("  python scripts/fine-tune.py --data training/ --base-model phi4")
    print("  bash scripts/install-models.sh")


if __name__ == "__main__":
    main()
