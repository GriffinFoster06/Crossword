#!/usr/bin/env python3
"""
Find valid 15x15 grid patterns with:
- 180° rotational symmetry
- All white runs ≥ 3 (rows AND columns)
- All white cells connected
- Exactly 30 across entries
- Black-above invariant: every across-entry start at col>0 has black above

Uses row-by-row backtracking with column-run constraint propagation.
"""

import sys
import json
import time
from pathlib import Path

SIZE = 15


def enumerate_row_patterns(num_runs, col0_white, col14_white):
    """All ways to place num_runs white runs (each ≥3) in 15 cells."""
    results = []
    row = [False] * SIZE

    def rec(start, runs_left):
        if runs_left == 0:
            if col0_white and not row[0]: return
            if not col0_white and row[0]: return
            if col14_white and not row[14]: return
            if not col14_white and row[14]: return
            results.append(tuple(row))
            return

        for s in range(start, SIZE - 2):
            if s == 0 and not col0_white:
                continue
            if s > 0 and s == start and start > 0:
                pass  # gap already ensured by caller
            min_tail = (runs_left - 1) * 4
            for length in range(3, SIZE - s + 1):
                end = s + length - 1
                if end >= SIZE:
                    break
                if runs_left == 1:
                    if col14_white and end != SIZE - 1:
                        continue
                    if not col14_white and end >= SIZE - 1:
                        continue
                else:
                    if end + 1 + min_tail > SIZE - 1:
                        continue
                    if end >= SIZE - 1:
                        continue
                for c in range(s, end + 1):
                    row[c] = True
                nxt = end + 2 if runs_left > 1 else SIZE
                rec(nxt, runs_left - 1)
                for c in range(s, end + 1):
                    row[c] = False

    rec(0, num_runs)
    return results


def validate_connectivity(grid):
    """BFS connectivity check for all white cells."""
    whites = [(r, c) for r in range(SIZE) for c in range(SIZE) if grid[r][c]]
    if not whites:
        return True
    seen = {whites[0]}
    stack = [whites[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < SIZE and 0 <= nc < SIZE and grid[nr][nc] and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    return len(seen) == len(whites)


def count_across(grid):
    """Count across entries (white runs of length ≥ 3 in each row)."""
    count = 0
    for r in range(SIZE):
        c = 0
        while c < SIZE:
            if grid[r][c]:
                s = c
                while c < SIZE and grid[r][c]:
                    c += 1
                if c - s >= 3:
                    count += 1
            else:
                c += 1
    return count


def check_column_runs(grid):
    """Check all column white runs are ≥ 3."""
    for c in range(SIZE):
        r = 0
        while r < SIZE:
            if grid[r][c]:
                s = r
                while r < SIZE and grid[r][c]:
                    r += 1
                if r - s < 3:
                    return False
            else:
                r += 1
    return True


def search():
    # Pre-compute all row patterns for each (num_runs, col0, col14) configuration
    print("Enumerating row patterns...", flush=True)
    pattern_cache = {}
    for runs in [1, 2, 3, 4]:
        for c0 in [True, False]:
            for c14 in [True, False]:
                pats = enumerate_row_patterns(runs, c0, c14)
                pattern_cache[(runs, c0, c14)] = pats
                if pats:
                    print(f"  runs={runs} col0={'W' if c0 else 'B'} col14={'W' if c14 else 'B'}: {len(pats)} patterns")

    # For each skeleton (a[], col0black), try to find a valid grid
    data_dir = Path(__file__).resolve().parents[1] / 'data' / 'raw'
    with open(data_dir / 'skeletons.json') as f:
        skeletons = json.load(f)
    skeletons = [s for s in skeletons if s['a'][0] >= 2]
    print(f"{len(skeletons)} skeletons")

    t0 = time.time()
    total_found = 0

    for si, sk in enumerate(skeletons):
        a = sk['a']
        col0black = set(sk['col0black'])

        # Build rows 0-7 with backtracking
        # State: rows[0..r-1] are placed, col_whites[c] tracks consecutive whites
        rows = [None] * 8
        col_whites = [0] * SIZE

        def get_candidates(r, cw):
            """Get valid row patterns for row r given column-white state cw."""
            c0 = r in col0black
            c14 = (SIZE - 1 - r) in col0black
            num_runs = a[r]
            key = (num_runs, not c0, not c14)
            base_patterns = pattern_cache.get(key, [])

            valid = []
            for pat in base_patterns:
                ok = True

                # Black-above invariant: run starts at c>0 must have black above
                if r > 0:
                    for c in range(1, SIZE):
                        if pat[c] and not pat[c - 1]:  # start of a run at c>0
                            # Check: c > 0, so left neighbor is black (gap). Need row above at c to be black.
                            if c > 0 and rows[r - 1][c]:
                                ok = False
                                break
                if not ok:
                    continue

                # Column-run check: no column white run ends at length 1 or 2
                for c in range(SIZE):
                    if not pat[c]:
                        # Column c is black in this row. Check if we're ending a short run.
                        if cw[c] in (1, 2):
                            ok = False
                            break
                if not ok:
                    continue

                valid.append(pat)
            return valid

        def solve_rows(r, cw):
            nonlocal total_found
            if r == 8:
                # All 8 rows placed. Build full grid and check.
                grid = [list(rows[i]) for i in range(8)]
                for rr in range(8, SIZE):
                    src = rows[SIZE - 1 - rr]
                    grid.append([src[SIZE - 1 - c] for c in range(SIZE)])

                # Row 7 must be palindromic
                if not all(grid[7][c] == grid[7][SIZE - 1 - c] for c in range(SIZE)):
                    return False

                # Check column runs for full grid
                if not check_column_runs(grid):
                    return False

                # Check connectivity
                if not validate_connectivity(grid):
                    return False

                # Check across count
                ac = count_across(grid)
                if ac != 30:
                    return False

                total_found += 1
                print(f"\n*** VALID GRID #{total_found} (skeleton {si}, a={a}) ***")
                for row in grid:
                    print(''.join('.' if x else '#' for x in row))
                print(f"Across entries: {ac}")

                # Save it
                out = {
                    'grid': [''.join('.' if x else '#' for x in row) for row in grid],
                    'skeleton_idx': si,
                    'a': a,
                    'col0black': list(col0black),
                }
                out_path = data_dir / f'valid_grid_{total_found}.json'
                with open(out_path, 'w') as f:
                    json.dump(out, f, indent=2)
                print(f"Saved to {out_path}")

                if total_found >= 10:
                    return True  # Found enough
                return False  # Keep searching

            candidates = get_candidates(r, cw)

            # For row 7, filter for palindromic patterns
            if r == 7:
                candidates = [p for p in candidates if all(p[c] == p[SIZE - 1 - c] for c in range(SIZE))]

            if not candidates:
                return False

            for pat in candidates:
                rows[r] = pat
                new_cw = list(cw)
                for c in range(SIZE):
                    if pat[c]:
                        new_cw[c] += 1
                    else:
                        new_cw[c] = 0
                if solve_rows(r + 1, new_cw):
                    return True

            rows[r] = None
            return False

        print(f"\rSkeleton {si}/{len(skeletons)} a={a} col0black={sorted(col0black)}", end='', flush=True)
        solve_rows(0, [0] * SIZE)

        if total_found >= 10:
            break

    print(f"\n\nTotal valid grids found: {total_found} in {time.time() - t0:.1f}s")


if __name__ == '__main__':
    search()
