#!/usr/bin/env python3
"""
Constructively generate valid symmetric 15x15 grids with exactly 30 across
entries, test acrostic feasibility, and fill the first workable one.

Construction: place symmetric black pairs one at a time; revert any placement
that creates a 1-or-2-letter run or disconnects the white cells. The result is
guaranteed structurally valid (no short words, connected, all cells checked).
"""

import random
import sys
import time
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

_DATA_DIR = Path(__file__).resolve().parents[1] / 'data' / 'raw'

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"
assert len(ACROSTIC) == 30


def runs_ok(g):
    """No across/down run of length 1 or 2."""
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


def connected(g):
    whites = [(r, c) for r in range(15) for c in range(15) if g[r][c] != '#']
    if not whites:
        return False
    seen = {whites[0]}
    stack = [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < 15 and 0 <= nc < 15 and g[nr][nc] != '#' and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    return len(seen) == len(whites)


def build_valid(rng, target_black):
    """Incrementally place symmetric black pairs, keeping the grid valid."""
    g = [['.'] * 15 for _ in range(15)]
    pairs = []
    for r in range(15):
        for c in range(15):
            r2, c2 = 14 - r, 14 - c
            if (r, c) <= (r2, c2):
                pairs.append((r, c, r2, c2))
    rng.shuffle(pairs)
    nblack = 0
    for (r, c, r2, c2) in pairs:
        if nblack >= target_black:
            break
        if g[r][c] == '#':
            continue
        g[r][c] = '#'
        g[r2][c2] = '#'
        if runs_ok(g) and connected(g):
            nblack += 1 if (r, c) == (r2, c2) else 2
        else:
            g[r][c] = '.'
            g[r2][c2] = '.'
    return g


def measure(rng, db, seconds=20):
    """Report the across-count distribution to calibrate target_black."""
    from collections import Counter
    dist = Counter()
    t0 = time.time()
    n = 0
    while time.time() - t0 < seconds:
        tb = rng.choice([28, 30, 32, 34, 36, 38])
        g = build_valid(rng, tb)
        n += 1
        dist[len(xword.across_slots(g))] += 1
    print(f"Built {n} valid grids. Across-count distribution:")
    for k in sorted(dist):
        print(f"  {k} across: {dist[k]}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'run'
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    rng = random.Random(seed)

    print("Loading word DB...")
    db = xword.WordDB(min_score=50)
    print(f"  {db.total()} words")

    if mode == 'measure':
        measure(rng, db)
        return

    t0 = time.time()
    built = valid30 = feasible = 0
    budget = float(sys.argv[3]) if len(sys.argv) > 3 else 600

    while time.time() - t0 < budget:
        tb = rng.choice([30, 32, 34, 36, 38])
        g = build_valid(rng, tb)
        built += 1
        if built % 2000 == 0:
            print(f"  [{time.time()-t0:.0f}s] built={built} valid30={valid30} feasible={feasible}", flush=True)
        if len(xword.across_slots(g)) != 30:
            continue
        valid30 += 1
        ok, bad = xword.feasibility(g, db, ACROSTIC)
        if not ok:
            continue
        feasible += 1
        print(f"\n[{time.time()-t0:.0f}s] Feasible grid #{feasible} "
              f"(built {built}, valid30 {valid30}). Filling...", flush=True)
        f = xword.Filler(g, db, ACROSTIC)
        if f.solve(time_limit=40, jitter=8.0):
            print(f"  *** FILLED ({f.nodes} nodes) ***")
            f.show()
            ac_e, dn_e, _ = f.entries()
            print("Acrostic:", ''.join(w[0] for _, w in ac_e))
            with open(_DATA_DIR / 'working_grid.json', 'w') as out:
                json.dump({'grid': [''.join(row) for row in f.grid], 'seed': seed,
                           'across': ac_e, 'down': dn_e}, out, indent=2)
            print("Saved working grid.")
            return
        else:
            print(f"  fill failed ({f.nodes} nodes)", flush=True)

    print(f"\nNo full fill. built={built} valid30={valid30} feasible={feasible}")


if __name__ == '__main__':
    main()
