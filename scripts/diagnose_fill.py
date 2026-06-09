#!/usr/bin/env python3
"""
Diagnose why acrostic fills fail on random grids.
Generates valid 30-across grids, then checks each down word's
forced-letter pattern against the word database.
"""
import sys
import random
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"
SIZE = 15


def build_random_grid(rng):
    """Build a random valid 15x15 grid by constructive black-square placement."""
    grid = [['.' for _ in range(SIZE)] for _ in range(SIZE)]
    target_blacks = rng.randint(32, 38)
    blacks = 0
    fails = 0

    while blacks < target_blacks:
        if fails > 400:
            return None
        r = rng.randint(0, SIZE - 1)
        c = rng.randint(0, SIZE - 1)
        sr, sc = SIZE - 1 - r, SIZE - 1 - c

        if grid[r][c] == '#':
            continue
        if (r, c) != (sr, sc) and grid[sr][sc] == '#':
            continue

        grid[r][c] = '#'
        if (r, c) != (sr, sc):
            grid[sr][sc] = '#'

        # Local run check
        if _local_ok(grid, r, c) and ((r, c) == (sr, sc) or _local_ok(grid, sr, sc)):
            blacks += 1 if (r, c) == (sr, sc) else 2
            fails = 0
        else:
            grid[r][c] = '.'
            if (r, c) != (sr, sc):
                grid[sr][sc] = '.'
            fails += 1

    # Check connectivity
    whites = [(r, c) for r in range(SIZE) for c in range(SIZE) if grid[r][c] != '#']
    if not whites:
        return None
    seen = {whites[0]}
    stack = [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            nr, nc = r+dr, c+dc
            if 0 <= nr < SIZE and 0 <= nc < SIZE and grid[nr][nc] != '#' and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    if len(seen) != len(whites):
        return None
    return grid


def _local_ok(grid, r, c):
    # Left segment
    if c > 0 and grid[r][c-1] != '#':
        s = c - 1
        while s > 0 and grid[r][s-1] != '#': s -= 1
        if c - s < 3: return False
    # Right segment
    if c + 1 < SIZE and grid[r][c+1] != '#':
        e = c + 1
        while e + 1 < SIZE and grid[r][e+1] != '#': e += 1
        if e - c < 3: return False
    # Above segment
    if r > 0 and grid[r-1][c] != '#':
        s = r - 1
        while s > 0 and grid[s-1][c] != '#': s -= 1
        if r - s < 3: return False
    # Below segment
    if r + 1 < SIZE and grid[r+1][c] != '#':
        e = r + 1
        while e + 1 < SIZE and grid[e+1][c] != '#': e += 1
        if e - r < 3: return False
    return True


def diagnose_grid(grid, db):
    """Check acrostic constraint viability for a grid."""
    # Get across slots sorted
    across = xword.across_slots(grid)
    across.sort(key=lambda s: (s[0], s[1]))

    if len(across) != 30:
        return None, f"across={len(across)}"

    acr_chars = list(ACROSTIC)

    # For each across entry, find the crossing down word at position 0
    # and what position the acrostic letter would be at in that down word
    down_constraints = {}  # (down_start_row, col) -> [(pos, letter)]

    dead_across = []
    for ai, slot in enumerate(across):
        if ai >= len(acr_chars):
            break
        sr, sc, length = slot
        letter = acr_chars[ai]

        # Check across domain
        matches = db.match_indices(length, [(0, letter)])
        if not matches:
            dead_across.append((ai, letter, length, pattern))
            continue

        # Find the down word at column sc that crosses row sr
        dr = sr
        while dr > 0 and grid[dr-1][sc] != '#':
            dr -= 1
        de = sr
        while de + 1 < SIZE and grid[de+1][sc] != '#':
            de += 1
        down_len = de - dr + 1
        pos_in_down = sr - dr

        key = (dr, sc)
        if key not in down_constraints:
            down_constraints[key] = {'len': down_len, 'constraints': []}
        down_constraints[key]['constraints'].append((pos_in_down, letter))

    if dead_across:
        return False, f"Dead across slots: {dead_across}"

    # Check each constrained down word
    dead_downs = []
    for (dr, dc), info in down_constraints.items():
        down_len = info['len']
        constraints = info['constraints']
        if down_len < 3:
            continue

        matches = db.match_indices(down_len, constraints)
        if not matches:
            pat = ['_'] * down_len
            for pos, letter in constraints:
                pat[pos] = letter
            dead_downs.append((dr, dc, down_len, ''.join(pat), constraints))

    # Count black-above entries
    ba_count = sum(1 for s in across if s[1] == 0 or (s[0] > 0 and grid[s[0]-1][s[1]] == '#'))

    return len(dead_downs) == 0, {
        'dead_downs': dead_downs,
        'total_constrained_downs': len(down_constraints),
        'black_above_count': ba_count,
        'multi_constrained': sum(1 for v in down_constraints.values() if len(v['constraints']) >= 2),
    }


def main():
    rng = random.Random(42)
    db = xword.WordDB(min_score=25)
    print(f"DB: {db.total()} words (min_score=25)")

    t0 = time.time()
    tried = 0
    valid30 = 0
    viable = 0
    dead_down_counts = []
    ba_counts = []

    while time.time() - t0 < 30:
        tried += 1
        grid = build_random_grid(rng)
        if grid is None:
            continue

        alive, info = diagnose_grid(grid, db)
        if info is None or isinstance(info, str):
            continue
        valid30 += 1

        dead_count = len(info['dead_downs'])
        dead_down_counts.append(dead_count)
        ba_counts.append(info['black_above_count'])

        if alive:
            viable += 1
            print(f"\n*** VIABLE GRID #{viable} ***")
            for row in grid:
                print(''.join(row))
            print(f"  black_above={info['black_above_count']}/30")
            print(f"  multi_constrained_downs={info['multi_constrained']}")
            if viable >= 3:
                break
        elif valid30 <= 5 or dead_count <= 3:
            print(f"\nGrid #{valid30}: dead_downs={dead_count} ba={info['black_above_count']}/30 multi={info['multi_constrained']}")
            for d in info['dead_downs'][:5]:
                print(f"  Dead: down at ({d[0]},{d[1]}) len={d[2]} pattern='{d[3]}' constraints={d[4]}")

    print(f"\n--- Stats (30s) ---")
    print(f"Tried: {tried}")
    print(f"Valid30: {valid30}")
    print(f"Viable (0 dead downs): {viable}")
    if dead_down_counts:
        avg_dead = sum(dead_down_counts) / len(dead_down_counts)
        min_dead = min(dead_down_counts)
        print(f"Dead downs: avg={avg_dead:.1f} min={min_dead} max={max(dead_down_counts)}")
    if ba_counts:
        avg_ba = sum(ba_counts) / len(ba_counts)
        print(f"Black-above: avg={avg_ba:.1f} min={min(ba_counts)} max={max(ba_counts)}")


if __name__ == '__main__':
    main()
