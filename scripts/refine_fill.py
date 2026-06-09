#!/usr/bin/env python3
"""
Given the successfully-filled grid pattern, try to fill it with higher
quality words using multiple random restarts at each score tier.
"""
import sys
import json
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"

# The grid pattern that successfully filled at min_score=0
GRID_PATTERN = [
    "######.....#####",
    "#####........###",
    "#...#........###",
    "......###......",
    ".....#...##....",
    "...#......#....",
    "#......#.....##",
    "###....#....###",
    "##.....#......#",
    "....#......#...",
    "....##...#.....",
    "....###......",
    "#........#...#",
    "###........#####",
    "#####.....######",
]

# Load from the actual shakespeare.json to get the exact grid pattern
puzzle_path = Path(__file__).parent.parent / 'puzzles' / 'shakespeare.json'
with open(puzzle_path) as f:
    puzzle = json.load(f)

# Extract black-square pattern
grid_strs = puzzle['grid']
pattern = []
for row_str in grid_strs:
    pattern.append([('#' if c == '#' else '.') for c in row_str])

print("Grid pattern:")
for row in pattern:
    print('  ' + ''.join(row))

# Try at each quality level
best_result = None
best_score = -1

for min_score in [50, 45, 40, 35, 30, 20, 10, 0]:
    db = xword.WordDB(min_score=min_score)
    print(f"\n=== min_score={min_score} ({db.total()} words) ===", flush=True)

    grid_copy = [row[:] for row in pattern]
    feas_ok, report = xword.feasibility(grid_copy, db, ACROSTIC)
    if not feas_ok:
        print(f"  Infeasible: {report}")
        continue

    print(f"  Feasible! Trying 200 restarts...", flush=True)
    t0 = time.time()

    for attempt in range(200):
        if time.time() - t0 > 120:
            break
        grid_copy = [row[:] for row in pattern]
        filler = xword.Filler(grid_copy, db, ACROSTIC)
        if filler.dead:
            print(f"  Dead after init")
            break
        ok = filler.solve(time_limit=15, jitter=15.0)
        if ok:
            ac, dn, numbers = filler.entries()
            first_letters = ''.join(w[0] for (_, w) in ac)
            words_all = [w for _, w in ac] + [w for _, w in dn]
            if first_letters != ACROSTIC:
                continue
            if len(set(words_all)) != len(words_all):
                continue

            # Calculate quality: average word score
            total_score = sum(db.score.get(w, 0) for w in words_all)
            avg_score = total_score / len(words_all)
            min_word_score = min(db.score.get(w, 0) for w in words_all)

            if avg_score > best_score:
                best_score = avg_score
                best_result = (filler, ac, dn, min_score, avg_score, min_word_score)
                print(f"  *** Fill #{attempt}: avg={avg_score:.1f} min={min_word_score} at min_score={min_score} ***")
                filler.show()

            if avg_score >= 55:
                break
        elif attempt % 20 == 0:
            print(f"  attempt {attempt}: fail", flush=True)

    if best_result and best_score >= 55:
        break

if best_result:
    filler, ac, dn, ms, avg, minw = best_result
    print(f"\n=== Best result: avg_score={avg:.1f} min_word={minw} (min_score tier={ms}) ===")
    filler.show()
    first_letters = ''.join(w[0] for (_, w) in ac)
    print(f"Acrostic: {first_letters}")

    puzzle = {
        'title': 'To Be or Not to Be',
        'author': 'CrossForge AI',
        'size': {'rows': 15, 'cols': 15},
        'grid': [''.join(row) for row in filler.grid],
        'acrostic': ACROSTIC,
        'note': 'The first letters of each across answer spell a famous Hamlet quote.',
        'clues': {
            'across': [{'number': n, 'answer': w, 'clue': ''} for n, w in ac],
            'down': [{'number': n, 'answer': w, 'clue': ''} for n, w in dn],
        },
    }
    out_path = Path(__file__).parent.parent / 'puzzles' / 'shakespeare.json'
    with open(out_path, 'w') as f:
        json.dump(puzzle, f, indent=2)
    print(f"Saved to {out_path}")
else:
    print("\nNo fill found")
