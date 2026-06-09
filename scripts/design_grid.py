#!/usr/bin/env python3
"""
Design a 15x15 grid for the Shakespeare acrostic by:
1. Choosing per-row black-square positions to control acrostic stacking
2. Checking column-run validity
3. Verifying acrostic constraint viability against word database
"""
import sys
import json
import random
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

SIZE = 15
ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"

# Load word database
try:
    import xword
    db = xword.WordDB(min_score=0)
    print(f"DB: {db.total()} words")
except Exception as e:
    print(f"Warning: Could not load word DB: {e}")
    db = None

def has_match(pattern):
    """Check if a pattern has any dictionary match."""
    if db is None:
        return True
    constraints = [(i, c) for i, c in enumerate(pattern) if c != '_']
    length = len(pattern)
    matches = db.match_indices(length, constraints)
    return len(matches) > 0

def check_column_runs(grid):
    """Check all column white runs >= 3. Returns list of violations."""
    violations = []
    for c in range(SIZE):
        r = 0
        while r < SIZE:
            if grid[r][c] == '.':
                s = r
                while r < SIZE and grid[r][c] == '.':
                    r += 1
                run_len = r - s
                if run_len < 3:
                    violations.append((s, c, run_len))
            else:
                r += 1
    return violations

def check_row_runs(grid):
    """Check all row white runs >= 3."""
    violations = []
    for r in range(SIZE):
        c = 0
        while c < SIZE:
            if grid[r][c] == '.':
                s = c
                while c < SIZE and grid[r][c] == '.':
                    c += 1
                run_len = c - s
                if run_len < 3:
                    violations.append((r, s, run_len))
            else:
                c += 1
    return violations

def count_across(grid):
    """Count across entries and return their (row, start_col, length)."""
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

def check_connectivity(grid):
    whites = [(r, c) for r in range(SIZE) for c in range(SIZE) if grid[r][c] == '.']
    if not whites:
        return True
    seen = {whites[0]}
    stack = [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            nr, nc = r+dr, c+dc
            if 0 <= nr < SIZE and 0 <= nc < SIZE and grid[nr][nc] == '.' and (nr,nc) not in seen:
                seen.add((nr,nc))
                stack.append((nr,nc))
    return len(seen) == len(whites)

def check_all_cells_checked(grid):
    """Every white cell must be in both an across and a down word of length >= 3."""
    for r in range(SIZE):
        for c in range(SIZE):
            if grid[r][c] != '.':
                continue
            # Across run
            s = c
            while s > 0 and grid[r][s-1] == '.': s -= 1
            e = c
            while e + 1 < SIZE and grid[r][e+1] == '.': e += 1
            if e - s + 1 < 3:
                return False
            # Down run
            s = r
            while s > 0 and grid[s-1][c] == '.': s -= 1
            e = r
            while e + 1 < SIZE and grid[e+1][c] == '.': e += 1
            if e - s + 1 < 3:
                return False
    return True

def compute_stacking(grid, across_entries):
    """For each down-word segment, find acrostic constraints."""
    down_constraints = {}  # (start_row, col) -> [(pos_in_down, letter)]

    for ai, (er, ec, elen) in enumerate(across_entries):
        if ai >= len(ACROSTIC):
            break
        letter = ACROSTIC[ai]
        col = ec  # starting column of across entry

        # Find start of down word at this column
        dr = er
        while dr > 0 and grid[dr-1][col] == '.':
            dr -= 1
        pos = er - dr

        key = (dr, col)
        if key not in down_constraints:
            down_constraints[key] = []
        down_constraints[key].append((pos, letter))

    return down_constraints

def check_acrostic_viability(grid, across_entries, skip_col0=False):
    """Check if all down-word acrostic patterns have dictionary matches."""
    dc = compute_stacking(grid, across_entries)

    dead = []
    for (dr, col), constraints in dc.items():
        if skip_col0 and col == 0:
            continue
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

        if not has_match(pat_str):
            dead.append((col, pat_str, len(constraints)))

    return dead

def print_grid(grid):
    for row in grid:
        print(''.join(row))

def try_grid_design(rng, target_across=30):
    """Try to design a valid grid with exactly target_across entries and viable acrostic."""
    grid = [['.' for _ in range(SIZE)] for _ in range(SIZE)]

    # Place symmetric black pairs, avoiding column-run violations
    target_blacks = rng.randint(30, 40)
    blacks = 0
    fails = 0

    while blacks < target_blacks:
        if fails > 500:
            return None, "too many fails"

        r = rng.randint(0, SIZE - 1)
        c = rng.randint(0, SIZE - 1)
        sr, sc = SIZE - 1 - r, SIZE - 1 - c

        if grid[r][c] == '#':
            fails += 1
            continue
        if (r, c) != (sr, sc) and grid[sr][sc] == '#':
            fails += 1
            continue

        # Place black
        grid[r][c] = '#'
        if (r, c) != (sr, sc):
            grid[sr][sc] = '#'

        # Check local constraints
        ok = True
        for cr, cc in [(r, c), (sr, sc)]:
            if (cr, cc) == (r, c) or (cr, cc) != (r, c):
                # Check row runs adjacent to this cell
                # Left run
                if cc > 0 and grid[cr][cc-1] == '.':
                    s = cc - 1
                    while s > 0 and grid[cr][s-1] == '.': s -= 1
                    if cc - s < 3: ok = False
                # Right run
                if cc + 1 < SIZE and grid[cr][cc+1] == '.':
                    e = cc + 1
                    while e + 1 < SIZE and grid[cr][e+1] == '.': e += 1
                    if e - cc < 3: ok = False
                # Up run
                if cr > 0 and grid[cr-1][cc] == '.':
                    s = cr - 1
                    while s > 0 and grid[s-1][cc] == '.': s -= 1
                    if cr - s < 3: ok = False
                # Down run
                if cr + 1 < SIZE and grid[cr+1][cc] == '.':
                    e = cr + 1
                    while e + 1 < SIZE and grid[e+1][cc] == '.': e += 1
                    if e - cr < 3: ok = False

        if ok:
            blacks += 1 if (r, c) == (sr, sc) else 2
            fails = 0
        else:
            grid[r][c] = '.'
            if (r, c) != (sr, sc):
                grid[sr][sc] = '.'
            fails += 1

    # Check connectivity
    if not check_connectivity(grid):
        return None, "disconnected"

    # Count across entries
    across = count_across(grid)
    if len(across) != target_across:
        return None, f"across={len(across)}"

    # Check Q-slot length
    if across[22][2] < 3:
        return None, "Q-slot too short"

    # Check all cells checked
    if not check_all_cells_checked(grid):
        return None, "unchecked cells"

    # Compute stacking
    dc = compute_stacking(grid, across)
    max_stack = max(len(v) for v in dc.values()) if dc else 0

    return grid, {'across': across, 'max_stack': max_stack, 'dc': dc}

def main():
    rng = random.Random(42)
    t0 = time.time()

    tried = 0
    valid30 = 0
    stack_counts = {}
    best_dead = 999

    while time.time() - t0 < 60:
        tried += 1
        grid, info = try_grid_design(rng)

        if grid is None:
            continue

        if not isinstance(info, dict):
            continue

        valid30 += 1
        ms = info['max_stack']
        stack_counts[ms] = stack_counts.get(ms, 0) + 1

        if ms > 3:
            continue

        # Check acrostic viability (skip col 0 — handled by skeleton separately)
        dead = check_acrostic_viability(grid, info['across'], skip_col0=True)

        if len(dead) < best_dead:
            best_dead = len(dead)
            print(f"\n--- Best so far: {len(dead)} dead patterns (max_stack={ms}) ---")
            print_grid(grid)
            if dead:
                for col, pat, ncons in dead[:5]:
                    print(f"  Dead: col{col} pattern='{pat}' ({ncons} constraints)")
            else:
                print("  *** ALL VIABLE! ***")
                # Save grid
                grid_strs = [''.join(row) for row in grid]
                out = {'grid': grid_strs, 'across': info['across'], 'max_stack': ms}
                with open(Path(__file__).parent.parent / 'data' / 'raw' / 'acrostic_grid.json', 'w') as f:
                    json.dump(out, f, indent=2)
                print("Saved to data/raw/acrostic_grid.json")
                return

        if valid30 % 100 == 0:
            print(f"[{time.time()-t0:.0f}s] tried={tried} v30={valid30} best_dead={best_dead} stack_dist={dict(sorted(stack_counts.items()))}")

    print(f"\n--- Final stats ---")
    print(f"Tried: {tried}, v30: {valid30}, best_dead: {best_dead}")
    print(f"Stack distribution: {dict(sorted(stack_counts.items()))}")

if __name__ == '__main__':
    main()
