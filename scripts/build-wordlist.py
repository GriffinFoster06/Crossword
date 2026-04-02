#!/usr/bin/env python3
"""
CrossForge Word List Compiler

Converts text word lists into the binary format used by CrossForge.
Supports multiple input files with automatic score normalization,
crosswordese penalties, freshness bonuses, and multi-word phrase inclusion.

Input formats (auto-detected):
  - WORD;SCORE          (score 0-100)
  - WORD\tSCORE         (score 0-100)
  - WORD\tFREQUENCY     (raw frequency, normalized)
  - WORD                (default score 50)
  Lines starting with # are ignored.

Output binary format (CWDB v1):
  Header: 4 bytes magic "CWDB" + 4 bytes version (u32 LE) + 4 bytes count (u32 LE)
  Per word: 1 byte length + 1 byte score (0-100) + N bytes ASCII uppercase

Usage:
  python build-wordlist.py input1.txt [input2.txt ...] -o resources/wordlist.bin
"""

import sys
import struct
import argparse
import re
from pathlib import Path
from collections import Counter


# ── Crosswordese: words that are valid but overused/tired in crosswords ──────
# These are penalized by subtracting from their base score.
CROSSWORDESE_PENALTIES: dict[str, int] = {
    # Old-school crosswordese standbys
    "EPEE": -40, "ESNE": -50, "ETUI": -40, "ALEE": -45, "ASEA": -45,
    "OLEO": -40, "ERNE": -40, "ERSE": -45, "SNEE": -40, "ENOL": -35,
    "ENOLS": -35, "INRO": -40, "NAEVI": -45, "ALULA": -35, "AREOLA": -30,
    "AREOLE": -35, "OSSA": -40, "ATILT": -30, "ATRIP": -35, "ODEA": -35,
    "AGEE": -40, "OGEE": -30, "SMEW": -35, "SPAE": -40, "RIEL": -30,
    "PIETA": -20, "TARN": -20, "SCREE": -15, "NEBS": -25, "NIBS": -20,
    "GESTE": -30, "BRAE": -25, "BRAE": -25, "NAIAD": -20, "LIERNE": -35,
    "EYOT": -35, "DROIT": -25, "IAMB": -20, "IAMBI": -30, "YORE": -15,
    "ERST": -25, "ANEW": -10, "ALOE": -15, "ARIA": -10, "OLLA": -30,
    "ORLE": -35, "ARCO": -25, "ALTO": -5, "OBOE": 0,  # oboe is fine
    # Partial words / affixes that become crosswordese
    "STER": -20, "NESS": -10, "MENT": -15,
    # Tired NYT specifics
    "OPES": -25, "ADOS": -15, "AEON": -10, "EONS": -10,
    "IOTA": -10, "OGLE": -10, "OGRE": -5,
}

# ── Freshness bonuses for lively, contemporary entries ──────────────────────
FRESHNESS_BONUSES: dict[str, int] = {
    # Modern tech / culture
    "PODCAST": 20, "STREAMING": 15, "TIKTOK": 20, "SELFIE": 20,
    "EMOJI": 20, "MEME": 25, "VIRAL": 20, "HASHTAG": 15, "UBER": 15,
    "LYFT": 10, "ZOOM": 20, "WIFI": 20, "PIXEL": 15, "AVATAR": 15,
    "INFLUENCER": 10, "STREAMER": 10, "GAMER": 15, "VLOG": 10, "BLOG": 10,
    # Vivid / lively vocab
    "YOLO": 20, "FOMO": 15, "MOJO": 20, "VIBE": 25, "VIBES": 20,
    "SLAY": 20, "BINGE": 20, "GHOSTED": 15, "RIZZ": 20, "DRIP": 15,
    "BANGER": 15, "LOWKEY": 10, "EXTRA": 15, "ICONIC": 20,
    # Pop culture touchstones
    "NETFLIX": 25, "GOOGLE": 25, "TWITTER": 15, "FACEBOOK": 10,
    "INSTAGRAM": 15, "SNAPCHAT": 10, "REDDIT": 15, "SPOTIFY": 20,
    "AMAZON": 15, "APPLE": 10, "TESLA": 15, "SPACEX": 15,
    # Strong imagery
    "NEON": 15, "RETRO": 15, "INDIE": 15, "NOIR": 20, "JAZZ": 15,
    "FUNK": 15, "SOUL": 10, "PUNK": 15, "RAVE": 15, "DISCO": 10,
    # Sports lingo
    "CLUTCH": 15, "DUNK": 15, "BLITZ": 15, "SLAM": 10, "SPIKE": 10,
    "SNAG": 10, "SWAT": 10, "GOAT": 20, "BUZZER": 10, "OVERTIME": 15,
    # Food & drink (often lively in crosswords)
    "TACO": 20, "SUSHI": 15, "RAMEN": 20, "BOBA": 15, "ACAI": 10,
    "SRIRACHA": 15, "HUMMUS": 15, "QUINOA": 10, "KOMBUCHA": 15,
    "ESPRESSO": 15, "LATTE": 15, "MATCHA": 15, "BRUNCH": 15,
    # Wordplay-friendly
    "ZANY": 15, "WITTY": 10, "SAVVY": 15, "GOOFY": 10, "QUIRKY": 15,
    "SNAZZY": 15, "JAZZY": 15, "FIZZY": 10, "FUZZY": 10, "BUZZY": 10,
}

# ── Multi-word / phrase entries that should be in any good crossword DB ──────
# These are commonly used as single puzzle entries (written without spaces).
PHRASES: list[tuple[str, int]] = [
    # Classic crossword entries
    ("ITSATRAP", 85), ("INASENSE", 65), ("ICECREAM", 80), ("SOBEIT", 65),
    ("ASAMI", 55), ("ALLONME", 60), ("ONTHEWHOLE", 55), ("ALLINALL", 60),
    ("ONTHEDOT", 65), ("INTHEEND", 65), ("ALLATONCE", 60), ("GOFORIT", 70),
    ("NOTBAD", 70), ("NOWAY", 75), ("COMEON", 75), ("YESMAN", 70),
    ("TOPDOG", 65), ("HOTDOG", 75), ("HOTSHOT", 70), ("BIGSHOT", 70),
    ("LONGSHOT", 70), ("MOONSHOT", 70), ("DARKSHOT", 50),
    # Compound words (commonly run together in puzzles)
    ("CROSSWORD", 90), ("WORDPLAY", 85), ("GRIDLOCK", 75),
    ("BREAKFAST", 80), ("BREAKDOWN", 70), ("BREAKAWAY", 65), ("BREAKOUT", 70),
    ("HANDSHAKE", 70), ("HANDBOOK", 65), ("HANDSTAND", 65), ("HANDPICKED", 65),
    ("FIREPLACE", 75), ("FIRESIDE", 65), ("FIREWORK", 75), ("FIREMAN", 65),
    ("WATERFALL", 75), ("WATERFRONT", 65), ("WATERPROOF", 65), ("WATERMARK", 70),
    ("EARTHQUAKE", 70), ("EARTHWORM", 65), ("WORLDWIDE", 70),
    ("BALLPARK", 70), ("BALLROOM", 70), ("BALLGAME", 65),
    ("PLAYGROUND", 70), ("PLAYMAKER", 65), ("PLAYBOOK", 65), ("PLAYWRIGHT", 75),
    ("WORKSHOP", 70), ("WORKLOAD", 65), ("WORKOUT", 75), ("WORKDAY", 65),
    ("TIMEOUT", 75), ("TIMELINE", 70), ("TIMELESS", 65), ("TIMEPIECE", 65),
    ("LIFETIME", 70), ("LIFESTYLE", 70), ("LIFELINE", 65), ("LIFESPAN", 65),
    ("DAYLIGHT", 70), ("DAYDREAM", 70), ("DAYBREAK", 65), ("DAYTIME", 65),
    ("NIGHTMARE", 70), ("NIGHTFALL", 65), ("NIGHTLIFE", 65), ("NIGHTSTAND", 65),
    ("SUNSHINE", 75), ("SUNRISE", 70), ("SUNSET", 70), ("SUNBEAM", 65),
    ("MOONLIGHT", 70), ("MOONSHINE", 65), ("MOONWALK", 70), ("MOONBEAM", 65),
    ("STARLIGHT", 65), ("STARBOARD", 65), ("STARDUST", 65), ("STARFISH", 65),
    ("RAINBOW", 75), ("RAINDROP", 65), ("RAINCOAT", 65), ("RAINFALL", 60),
    ("SNOWFLAKE", 70), ("SNOWBALL", 70), ("SNOWFALL", 65), ("SNOWFIELD", 55),
    ("WINDMILL", 65), ("WINDFALL", 65), ("WINDSHIELD", 65), ("WINDSURFER", 55),
    ("HOTLINE", 65), ("HOTBED", 60), ("HOTSPOT", 70), ("HOTCAKE", 65),
    ("COLDFRONT", 60), ("COLDSNAP", 60), ("COLDCASE", 70), ("COLDBLOODED", 60),
    ("HIGHLIGHT", 75), ("HIGHLAND", 65), ("HIGHWAY", 75), ("HIGHRISE", 65),
    ("LOWLAND", 60), ("LOWDOWN", 65), ("LOWKEY", 65), ("LOWRIDER", 65),
    ("BACKYARD", 75), ("BACKBONE", 70), ("BACKSTAGE", 70), ("BACKTRACK", 70),
    ("FRONTLINE", 70), ("FRONTMAN", 65), ("FRONTEND", 65),
    ("SIDEWALK", 75), ("SIDESHOW", 65), ("SIDELINE", 65), ("SIDESWIPE", 60),
    ("GROUNDWORK", 65), ("GROUNDHOG", 70), ("GROUNDSWELL", 55),
    ("LANDMARK", 70), ("LANDSLIDE", 70), ("LANDLORD", 65),
    ("CAMPFIRE", 70), ("CAMPGROUND", 65), ("CAMPSITE", 60),
    ("OVERLOOK", 70), ("OVERLAP", 65), ("OVERRIDE", 65), ("OVERVIEW", 70),
    ("UNDERMINE", 65), ("UNDERSCORE", 70), ("UNDERTONE", 60), ("UNDERWORLD", 65),
    ("OUTRIGHT", 70), ("OUTSMART", 70), ("OUTSTANDING", 70), ("OUTREACH", 65),
    # Pop/lively phrases
    ("SELFIE", 80), ("EMOJI", 75), ("PODCAST", 80), ("HASHTAG", 75),
    ("STREAMING", 75), ("DOWNLOAD", 70), ("UPLOAD", 65),
    ("OVERTIME", 70), ("PLAYOFF", 70), ("PENNANT", 65), ("DUGOUT", 65),
    ("BULLPEN", 65), ("INFIELD", 65), ("OUTFIELD", 65), ("HOMERUN", 75),
    ("TOUCHDOWN", 75), ("SLAPSHOT", 65), ("REBOUND", 70),
    # Common clue-friendly combos
    ("INAWORD", 55), ("INAROW", 60), ("INTOTO", 55), ("ENROUTE", 65),
    ("ALFRESCO", 65), ("EXTEMPORE", 55), ("PRORATA", 55), ("VERBATIM", 60),
    ("INFLAGRANTE", 50), ("PERPETUUM", 45), ("ADHOC", 65), ("PERSONA", 65),
    ("EXLIBRIS", 55), ("EXNIHILO", 50), ("ABINITO", 50),
    ("ALTRUISM", 65), ("ALTRUIST", 60), ("ACTIVISM", 65), ("ACTIVIST", 65),
    ("FEMINISM", 65), ("FEMINIST", 65), ("PACIFISM", 60), ("PACIFIST", 60),
    ("OPTIMISM", 70), ("OPTIMIST", 70), ("PESSIMISM", 65), ("PESSIMIST", 65),
    ("REALISM", 65), ("REALIST", 65), ("IDEALISM", 65), ("IDEALIST", 65),
    ("SOCIALISM", 65), ("SOCIALIST", 60), ("CAPITALISM", 65),
    ("TERRORISM", 55), ("TERRORIST", 55),
]


def normalize_score(raw: float, source_max: float, source_min: float = 0) -> int:
    """Normalize a raw score to the 0-100 range."""
    if source_max <= source_min:
        return 50
    normalized = (raw - source_min) / (source_max - source_min) * 100
    return int(max(0, min(100, round(normalized))))


def is_likely_frequency(values: list[float]) -> bool:
    """Heuristic: if the max value is >>100, treat as frequency (needs normalization)."""
    if not values:
        return False
    return max(values) > 200


def parse_wordlist(path: Path) -> dict[str, int]:
    """
    Parse a text word list file. Returns {WORD: score (0-100)}.

    Handles multiple formats:
    - WORD;SCORE or WORD\tSCORE (scores 0-100 used directly)
    - WORD\tFREQUENCY (large numbers normalized to 0-100)
    - Plain WORD (default score 50)
    - Lines beginning with # are comments
    """
    raw_entries: list[tuple[str, float]] = []

    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            word_raw = line
            score_raw: float = 50.0

            if ';' in line:
                parts = line.split(';', 1)
                word_raw = parts[0].strip()
                try:
                    score_raw = float(parts[1].strip())
                except (ValueError, IndexError):
                    score_raw = 50.0
            elif '\t' in line:
                parts = line.split('\t', 1)
                word_raw = parts[0].strip()
                try:
                    score_raw = float(parts[1].strip())
                except (ValueError, IndexError):
                    score_raw = 50.0

            # Clean: uppercase letters only (strips hyphens, apostrophes, accents)
            word = re.sub(r'[^A-Za-z]', '', word_raw).upper()

            # Filter: 3-21 letters, ASCII only
            if 3 <= len(word) <= 21 and word.isascii() and word.isalpha():
                raw_entries.append((word, score_raw))

    if not raw_entries:
        return {}

    # Detect if scores look like raw frequencies (need normalization)
    all_scores = [s for _, s in raw_entries]
    if is_likely_frequency(all_scores):
        score_max = max(all_scores)
        score_min = min(all_scores)
        words: dict[str, int] = {}
        for word, raw_score in raw_entries:
            score = normalize_score(raw_score, score_max, score_min)
            # Frequency-based: apply logarithmic curve for better distribution
            import math
            if raw_score > 0 and score_max > 0:
                log_score = int(math.log(raw_score + 1) / math.log(score_max + 1) * 100)
                score = max(score, log_score)
            if word not in words or score > words[word]:
                words[word] = min(100, max(0, score))
    else:
        words = {}
        for word, raw_score in raw_entries:
            score = int(min(100, max(0, round(raw_score))))
            if word not in words or score > words[word]:
                words[word] = score

    return words


def apply_adjustments(words: dict[str, int]) -> dict[str, int]:
    """Apply crosswordese penalties and freshness bonuses."""
    result = dict(words)

    for word, penalty in CROSSWORDESE_PENALTIES.items():
        if word in result:
            result[word] = max(0, min(100, result[word] + penalty))

    for word, bonus in FRESHNESS_BONUSES.items():
        if word in result:
            result[word] = max(0, min(100, result[word] + bonus))
        else:
            # Add the word if it wasn't in the source lists
            result[word] = max(0, min(100, 50 + bonus))

    return result


def add_phrases(words: dict[str, int]) -> dict[str, int]:
    """Add multi-word concatenated phrase entries."""
    result = dict(words)
    for phrase, score in PHRASES:
        clean = re.sub(r'[^A-Z]', '', phrase.upper())
        if 3 <= len(clean) <= 21:
            if clean not in result or score > result[clean]:
                result[clean] = score
    return result


def write_binary(words: dict[str, int], output: Path) -> None:
    """Write word database in CWDB binary format."""
    with open(output, 'wb') as f:
        f.write(b'CWDB')
        f.write(struct.pack('<I', 1))  # version
        f.write(struct.pack('<I', len(words)))

        for word in sorted(words.keys()):
            score = words[word]
            word_bytes = word.encode('ascii')
            f.write(struct.pack('B', len(word_bytes)))
            f.write(struct.pack('B', score))
            f.write(word_bytes)

    size_kb = output.stat().st_size / 1024
    print(f"\nWrote {len(words):,} words to {output} ({size_kb:.0f} KB)")

    lengths = Counter(len(w) for w in words)
    scores = list(words.values())
    avg_score = sum(scores) / len(scores) if scores else 0
    low = sum(1 for s in scores if s < 30)
    mid = sum(1 for s in scores if 30 <= s < 60)
    high = sum(1 for s in scores if s >= 60)

    print("\nWord length distribution:")
    for length in sorted(lengths):
        bar = '█' * min(40, lengths[length] // 1000)
        print(f"  {length:2d} letters: {lengths[length]:7,}  {bar}")

    print(f"\nScore distribution:")
    print(f"  Low  (0-29):  {low:7,} words ({100*low//len(words)}%)")
    print(f"  Mid  (30-59): {mid:7,} words ({100*mid//len(words)}%)")
    print(f"  High (60+):   {high:7,} words ({100*high//len(words)}%)")
    print(f"  Average score: {avg_score:.1f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Compile word lists to CrossForge binary format',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python build-wordlist.py data/raw/scowl_merged.txt -o resources/wordlist.bin
  python build-wordlist.py scowl.txt google_10k.txt phrases.txt -o wordlist.bin
  python build-wordlist.py *.txt -o wordlist.bin --min-score 10
        """
    )
    parser.add_argument('inputs', nargs='+', help='Input text files')
    parser.add_argument('-o', '--output', default='resources/wordlist.bin',
                        help='Output binary file (default: resources/wordlist.bin)')
    parser.add_argument('--min-score', type=int, default=5,
                        help='Minimum score to include (default: 5)')
    parser.add_argument('--no-phrases', action='store_true',
                        help='Skip adding multi-word phrase entries')
    parser.add_argument('--no-adjustments', action='store_true',
                        help='Skip crosswordese penalties / freshness bonuses')
    args = parser.parse_args()

    all_words: dict[str, int] = {}
    for input_path_str in args.inputs:
        path = Path(input_path_str)
        if not path.exists():
            print(f"Warning: {path} not found, skipping", file=sys.stderr)
            continue
        words = parse_wordlist(path)
        print(f"Loaded {len(words):,} words from {path.name}")
        for word, score in words.items():
            if word not in all_words or score > all_words[word]:
                all_words[word] = score

    if not all_words:
        print("Error: no words loaded", file=sys.stderr)
        sys.exit(1)

    print(f"\nTotal unique words before adjustments: {len(all_words):,}")

    if not args.no_phrases:
        all_words = add_phrases(all_words)
        print(f"After adding phrases: {len(all_words):,}")

    if not args.no_adjustments:
        all_words = apply_adjustments(all_words)
        print("Applied crosswordese penalties and freshness bonuses")

    # Filter by minimum score
    if args.min_score > 0:
        before = len(all_words)
        all_words = {w: s for w, s in all_words.items() if s >= args.min_score}
        removed = before - len(all_words)
        if removed:
            print(f"Removed {removed:,} words below min-score {args.min_score}")

    print(f"Final word count: {len(all_words):,}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    write_binary(all_words, output)


if __name__ == '__main__':
    main()
