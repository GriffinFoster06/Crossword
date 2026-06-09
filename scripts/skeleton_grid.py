#!/usr/bin/env python3
"""
Generate grids matching a specific skeleton's per-row entry counts,
then check interior acrostic viability.
Uses pre-enumerated row patterns for correct run counts.
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

# Load all skeletons
with open(Path(__file__).parent.parent / 'data' / 'raw' / 'skeletons.json') as f:
    skeletons = json.load(f)

# Filter skeletons with verified col0 words
viable_skeletons = []
for sk in skeletons:
    col0words = sk.get('col0words', [])
    all_ok = True
    for w in col0words:
        constraints = [(i, c) for i, c in enumerate(w)]
        matches = db.match_indices(len(w), constraints)
        if not matches:
            all_ok = False
            break
    if all_ok and col0words:
        viable_skeletons.append(sk)

viable_skeletons.sort(key=lambda s: len(s['col0black']))
print(f"{len(viable_skeletons)} viable skeletons")


def enumerate_row_patterns(num_runs, col0_white, col14_white):
    """Enumerate all ways to place num_runs white runs (each >= 3) in 15 cells."""
    results = []

    def rec(runs, start, remaining_runs):
        if remaining_runs == 0:
            # Build pattern
            row = ['#'] * SIZE
            for s, e in runs:
                for c in range(s, e + 1):
                    row[c] = '.'
            # Check constraints
            if col0_white and row[0] == '#':
                return
            if not col0_white and row[0] == '.':
                return
            if col14_white and row[SIZE-1] == '#':
                return
            if not col14_white and row[SIZE-1] == '.':
                return
            results.append(tuple(row))
            return

        for s in range(start, SIZE):
            min_remaining = (remaining_runs - 1) * 4  # each remaining run needs >= 3 + 1 gap
            for length in range(3, SIZE - s - min_remaining + 1):
                e = s + length - 1
                if e >= SIZE:
                    break
                # Last run: must end properly
                if remaining_runs == 1:
                    if col14_white and e != SIZE - 1:
                        # Need col14 white, so last run must include col14
                        if e < SIZE - 1:
                            continue
                    if not col14_white and e == SIZE - 1:
                        continue
                else:
                    if e >= SIZE - 1:
                        break

                runs.append((s, e))
                next_start = e + 2  # at least one gap
                rec(runs, next_start, remaining_runs - 1)
                runs.pop()

    rec([], 0, num_runs)
    return results


# Pre-enumerate all row patterns
print("Enumerating row patterns...")
pattern_cache = {}
for runs in range(1, 6):
    for c0 in [True, False]:
        for c14 in [True, False]:
            key = (runs, c0, c14)
            pats = enumerate_row_patterns(runs, c0, c14)
            pattern_cache[key] = pats
            if pats:
                print(f"  runs={runs} c0={'W' if c0 else 'B'} c14={'W' if c14 else 'B'}: {len(pats)}")


def get_across_entries(grid):
    entries = []
    for r in range(SIZE):
        c = 0
        while c < SIZE:
            if grid[r][c] == '.':
                s = c
                while c < SIZE and grid[r][c] == '.':
                    c += 1
                if c - s >= 3:
                    entries.append((r, s, c - s))
            else:
                c += 1
    return entries


def check_interior_viability(grid, across_entries):
    down_constraints = {}
    for ai, (er, ec, elen) in enumerate(across_entries):
        if ai >= len(ACROSTIC):
            break
        letter = ACROSTIC[ai]
        col = ec

        dr = er
        while dr > 0 and grid[dr-1][col] == '.':
            dr -= 1
        pos = er - dr

        key = (dr, col)
        if key not in down_constraints:
            down_constraints[key] = []
        down_constraints[key].append((pos, letter))

    dead = []
    max_stack = 0
    for (dr, col), constraints in down_constraints.items():
        if col == 0 or col == SIZE - 1:
            continue

        max_stack = max(max_stack, len(constraints))

        de = dr
        while de + 1 < SIZE and grid[de+1][col] == '.':
            de += 1
        dlen = de - dr + 1
        if dlen < 3:
            continue

        pattern = ['_'] * dlen
        for pos, letter in constraints:
            if pos < dlen:
                pattern[pos] = letter
        pat_str = ''.join(pattern)

        cons_for_db = [(i, c) for i, c in enumerate(pat_str) if c != '_']
        matches = db.match_indices(dlen, cons_for_db)
        if not matches:
            dead.append((col, pat_str, len(constraints)))

    return dead, max_stack


def build_and_check(rng, sk, max_attempts=500):
    """Build random grids matching skeleton, check interior viability."""
    a = sk['a']
    col0black = set(sk['col0black'])
    # col14 blacks are at symmetric positions
    col14black = set(SIZE - 1 - r for r in col0black)

    results = []

    for attempt in range(max_attempts):
        grid = [None] * SIZE
        ok = True

        # Build rows 0-7
        for r in range(8):
            c0w = r not in col0black
            c14w = r not in col14black
            key = (a[r], c0w, c14w)
            pats = pattern_cache.get(key, [])
            if not pats:
                ok = False
                break

            # Check column run constraints with previously placed rows
            valid_pats = []
            for pat in pats:
                col_ok = True
                for c in range(SIZE):
                    if pat[c] == '#':
                        # Check: ending a short white run in this column?
                        if r > 0:
                            # Count consecutive whites above
                            whites_above = 0
                            for rr in range(r - 1, -1, -1):
                                if grid[rr][c] == '.':
                                    whites_above += 1
                                else:
                                    break
                            if whites_above in (1, 2):
                                col_ok = False
                                break
                if col_ok:
                    valid_pats.append(pat)

            if not valid_pats:
                ok = False
                break

            grid[r] = list(rng.choice(valid_pats))

        if not ok:
            continue

        # Row 7 must be palindromic
        r7 = grid[7]
        is_palindrome = all(r7[c] == r7[SIZE-1-c] for c in range(SIZE))
        if not is_palindrome:
            continue

        # Generate rows 8-14 by 180-degree rotation
        for r in range(8, SIZE):
            src_r = SIZE - 1 - r
            grid[r] = list(reversed(grid[src_r]))

        # Verify symmetric rows have correct entry counts
        sym_ok = True
        for r in range(8, SIZE):
            runs = 0
            c = 0
            while c < SIZE:
                if grid[r][c] == '.':
                    s = c
                    while c < SIZE and grid[r][c] == '.':
                        c += 1
                    if c - s >= 3:
                        runs += 1
                    elif c - s > 0:
                        sym_ok = False
                        break
                else:
                    c += 1
            if not sym_ok or runs != a[r]:
                sym_ok = False
                break
        if not sym_ok:
            continue

        # Check full column runs
        col_ok = True
        for c in range(SIZE):
            r = 0
            while r < SIZE:
                if grid[r][c] == '.':
                    s = r
                    while r < SIZE and grid[r][c] == '.':
                        r += 1
                    if r - s < 3:
                        col_ok = False
                        break
                else:
                    r += 1
            if not col_ok:
                break
        if not col_ok:
            continue

        # Connectivity check
        whites = [(r, c) for r in range(SIZE) for c in range(SIZE) if grid[r][c] == '.']
        if not whites:
            continue
        seen = {whites[0]}
        stack_bfs = [whites[0]]
        while stack_bfs:
            r, c = stack_bfs.pop()
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < SIZE and 0 <= nc < SIZE and grid[nr][nc] == '.' and (nr,nc) not in seen:
                    seen.add((nr,nc))
                    stack_bfs.append((nr,nc))
        if len(seen) != len(whites):
            continue

        # Check all cells are in both across and down words >= 3
        all_checked = True
        for r in range(SIZE):
            for c in range(SIZE):
                if grid[r][c] != '.':
                    continue
                s = c
                while s > 0 and grid[r][s-1] == '.': s -= 1
                e = c
                while e + 1 < SIZE and grid[r][e+1] == '.': e += 1
                if e - s + 1 < 3:
                    all_checked = False
                    break
                s = r
                while s > 0 and grid[s-1][c] == '.': s -= 1
                e = r
                while e + 1 < SIZE and grid[e+1][c] == '.': e += 1
                if e - s + 1 < 3:
                    all_checked = False
                    break
            if not all_checked:
                break
        if not all_checked:
            continue

        across = get_across_entries(grid)
        if len(across) != 30:
            continue

        results.append((grid, across))

    return results


def main():
    rng = random.Random(42)
    t0 = time.time()

    total_built = 0
    total_checked = 0
    best_dead = 999

    for si, sk in enumerate(viable_skeletons):
        if time.time() - t0 > 300:
            break

        grids = build_and_check(rng, sk, max_attempts=2000)
        total_built += len(grids)

        for grid, across in grids:
            total_checked += 1
            dead, max_stack = check_interior_viability(grid, across)

            if len(dead) < best_dead:
                best_dead = len(dead)
                print(f"\n--- Best: {len(dead)} dead (ms={max_stack}) sk#{si} a={sk['a']} ---")
                for row in grid:
                    print(''.join(row))
                for col, pat, nc in dead[:5]:
                    print(f"  Dead: col{col} '{pat}' ({nc}cons)")
                if not dead:
                    print("  *** ALL INTERIOR VIABLE! ***")
                    grid_strs = [''.join(row) for row in grid]
                    out = {
                        'grid': grid_strs,
                        'skeleton': sk,
                        'across': [list(e) for e in across],
                    }
                    with open(Path(__file__).parent.parent / 'data' / 'raw' / 'acrostic_grid.json', 'w') as f:
                        json.dump(out, f, indent=2)
                    print("Saved!")
                    return

        if total_built > 0 and si % 5 == 0:
            print(f"[{time.time()-t0:.0f}s] sk={si}/{len(viable_skeletons)} built={total_built} checked={total_checked} best_dead={best_dead}")

    print(f"\nDone: {len(viable_skeletons)} skeletons, built={total_built} checked={total_checked} best_dead={best_dead}")


if __name__ == '__main__':
    main()
