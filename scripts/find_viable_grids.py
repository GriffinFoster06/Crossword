#!/usr/bin/env python3
"""
Find multiple viable grids for the Shakespeare acrostic, save them all,
then test each with the Rust solver.
"""
import sys
import json
import random
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

SIZE = 15
ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"

db = xword.WordDB(min_score=0)
print(f"DB: {db.total()} words")

with open(Path(__file__).parent.parent / 'data' / 'raw' / 'skeletons.json') as f:
    skeletons = json.load(f)

# Filter skeletons: verified col0words + no 15-length entries
good_skeletons = []
for sk in skeletons:
    col0words = sk.get('col0words', [])
    if not col0words:
        continue
    all_ok = True
    for w in col0words:
        cons = [(i, c) for i, c in enumerate(w)]
        if not db.match_indices(len(w), cons):
            all_ok = False
            break
    if not all_ok:
        continue
    a = sk['a']
    col0black = set(sk['col0black'])
    col14black = set(14 - r for r in col0black)
    has_15 = any(a[r] == 1 and r not in col0black and r not in col14black for r in range(15))
    if has_15:
        continue
    good_skeletons.append(sk)

print(f"{len(good_skeletons)} good skeletons")

# Pre-enumerate row patterns
def enumerate_row_patterns(num_runs, col0_white, col14_white):
    results = []
    def rec(runs, start, remaining):
        if remaining == 0:
            row = ['#'] * SIZE
            for s, e in runs:
                for c in range(s, e+1):
                    row[c] = '.'
            if col0_white and row[0] == '#': return
            if not col0_white and row[0] == '.': return
            if col14_white and row[SIZE-1] == '#': return
            if not col14_white and row[SIZE-1] == '.': return
            results.append(tuple(row))
            return
        for s in range(start, SIZE):
            min_remaining = (remaining - 1) * 4
            for length in range(3, SIZE - s - min_remaining + 1):
                e = s + length - 1
                if e >= SIZE: break
                if remaining == 1:
                    if col14_white and e != SIZE - 1: continue
                    if not col14_white and e == SIZE - 1: continue
                else:
                    if e >= SIZE - 1: break
                runs.append((s, e))
                rec(runs, e + 2, remaining - 1)
                runs.pop()
    rec([], 0, num_runs)
    return results

pattern_cache = {}
for runs in range(1, 6):
    for c0 in [True, False]:
        for c14 in [True, False]:
            pattern_cache[(runs, c0, c14)] = enumerate_row_patterns(runs, c0, c14)

def get_across_entries(grid):
    entries = []
    for r in range(SIZE):
        c = 0
        while c < SIZE:
            if grid[r][c] == '.':
                s = c
                while c < SIZE and grid[r][c] == '.': c += 1
                if c - s >= 3: entries.append((r, s, c - s))
            else: c += 1
    return entries

def check_interior_viability(grid, across_entries):
    down_constraints = {}
    for ai, (er, ec, elen) in enumerate(across_entries):
        if ai >= len(ACROSTIC): break
        letter = ACROSTIC[ai]
        col = ec
        dr = er
        while dr > 0 and grid[dr-1][col] == '.': dr -= 1
        pos = er - dr
        key = (dr, col)
        if key not in down_constraints: down_constraints[key] = []
        down_constraints[key].append((pos, letter))

    for (dr, col), constraints in down_constraints.items():
        if col == 0 or col == SIZE - 1: continue
        de = dr
        while de + 1 < SIZE and grid[de+1][col] == '.': de += 1
        dlen = de - dr + 1
        if dlen < 3: continue
        pattern = ['_'] * dlen
        for pos, letter in constraints:
            if pos < dlen: pattern[pos] = letter
        pat_str = ''.join(pattern)
        cons_for_db = [(i, c) for i, c in enumerate(pat_str) if c != '_']
        matches = db.match_indices(dlen, cons_for_db)
        if not matches:
            return False
    return True

def build_grid(rng, sk):
    a = sk['a']
    col0black = set(sk['col0black'])
    col14black = set(14 - r for r in col0black)

    grid = [None] * SIZE
    for r in range(8):
        c0w = r not in col0black
        c14w = r not in col14black
        pats = pattern_cache.get((a[r], c0w, c14w), [])
        if not pats: return None

        valid_pats = []
        for pat in pats:
            ok = True
            for c in range(SIZE):
                if pat[c] == '#' and r > 0:
                    w = 0
                    for rr in range(r-1, -1, -1):
                        if grid[rr][c] == '.': w += 1
                        else: break
                    if w in (1, 2): ok = False; break
            if ok: valid_pats.append(pat)

        if not valid_pats: return None
        grid[r] = list(rng.choice(valid_pats))

    if not all(grid[7][c] == grid[7][14-c] for c in range(SIZE)): return None

    for r in range(8, SIZE):
        grid[r] = list(reversed(grid[14-r]))

    for r in range(8, SIZE):
        runs = 0; c = 0
        while c < SIZE:
            if grid[r][c] == '.':
                s = c
                while c < SIZE and grid[r][c] == '.': c += 1
                if c - s >= 3: runs += 1
                elif c - s > 0: return None
            else: c += 1
        if runs != a[r]: return None

    for c in range(SIZE):
        r = 0
        while r < SIZE:
            if grid[r][c] == '.':
                s = r
                while r < SIZE and grid[r][c] == '.': r += 1
                if r - s < 3: return None
            else: r += 1

    whites = [(r, c) for r in range(SIZE) for c in range(SIZE) if grid[r][c] == '.']
    if not whites: return None
    seen = {whites[0]}; stack = [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            nr, nc = r+dr, c+dc
            if 0 <= nr < SIZE and 0 <= nc < SIZE and grid[nr][nc] == '.' and (nr,nc) not in seen:
                seen.add((nr,nc)); stack.append((nr,nc))
    if len(seen) != len(whites): return None

    for r in range(SIZE):
        for c in range(SIZE):
            if grid[r][c] != '.': continue
            s = c
            while s > 0 and grid[r][s-1] == '.': s -= 1
            e = c
            while e+1 < SIZE and grid[r][e+1] == '.': e += 1
            if e - s + 1 < 3: return None
            s = r
            while s > 0 and grid[s-1][c] == '.': s -= 1
            e = r
            while e+1 < SIZE and grid[e+1][c] == '.': e += 1
            if e - s + 1 < 3: return None

    across = get_across_entries(grid)
    if len(across) != 30: return None
    return grid, across


def main():
    rng = random.Random(1)
    t0 = time.time()

    viable_grids = []
    total_checked = 0

    for seed_offset in range(100):
        if time.time() - t0 > 300 or len(viable_grids) >= 50:
            break
        rng = random.Random(seed_offset * 1000 + 42)

        for sk in good_skeletons:
            if time.time() - t0 > 300 or len(viable_grids) >= 50:
                break

            for _ in range(500):
                result = build_grid(rng, sk)
                if result is None:
                    continue
                grid, across = result
                total_checked += 1

                if check_interior_viability(grid, across):
                    max_len = max(e[2] for e in across)
                    grid_strs = [''.join(row) for row in grid]
                    viable_grids.append({
                        'grid': grid_strs,
                        'skeleton': sk,
                        'across': [list(e) for e in across],
                        'max_len': max_len,
                    })
                    print(f"Viable grid #{len(viable_grids)}: max_len={max_len} sk_a={sk['a']}")

    print(f"\nFound {len(viable_grids)} viable grids in {time.time()-t0:.1f}s (checked {total_checked})")

    # Save all viable grids
    out_path = Path(__file__).parent.parent / 'data' / 'raw' / 'acrostic_grids.json'
    with open(out_path, 'w') as f:
        json.dump(viable_grids, f, indent=2)
    print(f"Saved to {out_path}")

    # Print stats
    if viable_grids:
        max_lens = [g['max_len'] for g in viable_grids]
        print(f"Max entry lengths: min={min(max_lens)} max={max(max_lens)} avg={sum(max_lens)/len(max_lens):.1f}")


if __name__ == '__main__':
    main()
