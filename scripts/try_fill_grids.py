#!/usr/bin/env python3
"""Try filling viable grids using the Python filler with random restarts."""
import sys
import json
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"

db = xword.WordDB(min_score=0)
print(f"DB: {db.total()} words")

grids_path = Path(__file__).parent.parent / 'data' / 'raw' / 'acrostic_grids.json'
with open(grids_path) as f:
    grids = json.load(f)

grids_sorted = sorted(enumerate(grids), key=lambda x: x[1]['max_len'])
print(f"{len(grids_sorted)} grids loaded")

t0 = time.time()
for gi, g in grids_sorted:
    if time.time() - t0 > 500:
        break
    grid = [list(row) for row in g['grid']]
    max_len = g['max_len']

    feas_ok, report = xword.feasibility(grid, db, ACROSTIC)
    if not feas_ok:
        print(f"Grid #{gi} (ml={max_len}): infeasible after AC — {report}")
        continue

    print(f"Grid #{gi} (ml={max_len}): feasible, trying fills...", flush=True)
    for attempt in range(20):
        grid_copy = [row[:] for row in grid]
        filler = xword.Filler(grid_copy, db, ACROSTIC)
        if filler.dead:
            break
        ok = filler.solve(time_limit=30, jitter=12.0)
        if ok:
            print(f"  *** FILLED on attempt {attempt}! nodes={filler.nodes} ***")
            filler.show()
            ac, dn, numbers = filler.entries()
            first_letters = ''.join(w[0] for (_, w) in ac)
            print(f"  Acrostic: {first_letters}")
            if first_letters == ACROSTIC:
                print("  ACROSTIC VERIFIED!")
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
                out_path.parent.mkdir(exist_ok=True)
                with open(out_path, 'w') as f:
                    json.dump(puzzle, f, indent=2)
                print(f"  Saved to {out_path}")
                sys.exit(0)
            else:
                print(f"  MISMATCH: {first_letters}")
        else:
            print(f"  attempt {attempt}: fail nodes={filler.nodes}", flush=True)

print(f"\nNo grid was fillable in {time.time()-t0:.1f}s")
