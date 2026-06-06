#!/usr/bin/env python3
"""
Given a feasible column-0 skeleton (a[] + col0 black pattern), construct full
grids by randomly placing interior black squares (with 180 symmetry) to realize
the per-row across counts, then test acrostic feasibility and fill.
"""

import sys
import json
import random
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

_DATA_DIR = Path(__file__).resolve().parents[1] / 'data' / 'raw'

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"


def runs_ok(g):
    for r in range(15):
        c = 0
        while c < 15:
            if g[r][c] != '#':
                s = c
                while c < 15 and g[r][c] != '#':
                    c += 1
                if c - s in (1, 2):
                    return False
            else:
                c += 1
    for c in range(15):
        r = 0
        while r < 15:
            if g[r][c] != '#':
                s = r
                while r < 15 and g[r][c] != '#':
                    r += 1
                if r - s in (1, 2):
                    return False
            else:
                r += 1
    return True


def across_count_row(g, r):
    n = 0
    c = 0
    while c < 15:
        if g[r][c] != '#':
            s = c
            while c < 15 and g[r][c] != '#':
                c += 1
            if c - s >= 3:
                n += 1
        else:
            c += 1
    return n


def build_grid(a, col0black, rng):
    """Directed construction: place symmetric black pairs to hit the exact
    per-row across counts while keeping all runs >= 3 (down-words included)."""
    g = [['.'] * 15 for _ in range(15)]
    for r in col0black:
        g[r][0] = '#'
        g[14 - r][14] = '#'
    if not runs_ok(g):
        return None

    for r in range(8):
        rm = 14 - r
        guard = 0
        while across_count_row(g, r) < a[r]:
            guard += 1
            if guard > 300:
                return None
            cols = list(range(1, 14))
            rng.shuffle(cols)
            placed = False
            for c in cols:
                cm = 14 - c
                cells = {(r, c), (rm, cm)}  # symmetric pair (handles r==7 too)
                if any(g[rr][cc] == '#' for rr, cc in cells):
                    continue
                for rr, cc in cells:
                    g[rr][cc] = '#'
                if runs_ok(g) and across_count_row(g, r) <= a[r] and across_count_row(g, rm) <= a[rm]:
                    placed = True
                    break
                for rr, cc in cells:
                    g[rr][cc] = '.'
            if not placed:
                return None
    return g


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    mode = sys.argv[2] if len(sys.argv) > 2 else 'measure'
    rng = random.Random(seed)

    min_score = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    db = xword.WordDB(min_score=min_score)
    print(f"DB: {db.total()} words (min_score={min_score})")

    with open(_DATA_DIR / 'skeletons.json') as _f:
        skeletons = json.load(_f)
    # Only structurally-plausible: a[0]>=2 (row 0 not a full 15-word that orphans
    # rows 1-2). Rank by fewest 15-letter rows then col0 word quality.
    skeletons = [s for s in skeletons if s['a'][0] >= 2]
    skeletons.sort(key=lambda s: (s['ones'], -s['minscore']))
    print(f"{len(skeletons)} candidate skeletons (a[0]>=2)")

    t0 = time.time()
    budget = float(sys.argv[3]) if len(sys.argv) > 3 else 120

    built = valid30 = alive = 0
    # Round-robin over skeletons: with AC-3, dead grids are rejected in ~ms,
    # so we can sweep thousands of grids across all skeletons quickly.
    while time.time() - t0 < budget:
        progressed = False
        for si, sk in enumerate(skeletons):
            if time.time() - t0 > budget:
                break
            a = sk['a']
            col0black = sk['col0black']
            g = build_grid(a, col0black, rng)
            if g is None:
                continue
            progressed = True
            built += 1
            if xword.validate_structure(g):
                continue
            if len(xword.across_slots(g)) != 30:
                continue
            valid30 += 1
            # Build the filler once: __init__ runs AC-3 to a fixpoint and sets
            # .dead if the grid is provably unfillable.
            f = xword.Filler(g, db, ACROSTIC)
            if f.dead:
                continue
            alive += 1
            print(f"\n[{time.time()-t0:.0f}s] skel#{si} a={a} col0={sk['col0words']} "
                  f"ALIVE after AC-3 (built={built}, alive={alive}). Filling...", flush=True)
            if f.solve(time_limit=30, jitter=8.0):
                print(f"*** FILLED ({f.nodes} nodes) ***")
                f.show()
                ac_e, dn_e, _ = f.entries()
                print("Acrostic:", ''.join(w[0] for _, w in ac_e))
                with open(_DATA_DIR / 'working_grid.json', 'w') as _out:
                    json.dump({'grid': [''.join(row) for row in f.grid], 'seed': seed,
                               'skeleton': si, 'min_score': min_score}, _out, indent=2)
                print("Saved working grid.")
                return
            else:
                print(f"  fill failed ({f.nodes} nodes)", flush=True)
            if built % 2000 == 0:
                print(f"  [{time.time()-t0:.0f}s] built={built} valid30={valid30} "
                      f"alive={alive}", flush=True)
        if not progressed:
            break

    print(f"\nNo fill found. built={built} valid30={valid30} alive={alive}")


if __name__ == '__main__':
    main()
