#!/usr/bin/env python3
"""Diagnose why build_clean grids fail validation."""
import sys, json, random
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xword

_DATA_DIR = Path(__file__).resolve().parents[1] / 'data' / 'raw'

def gen_row(above, a_r, col0_black, col14_black, rng):
    if above is None:
        allowed = set(range(1, 15))
    else:
        allowed = {c for c in range(1, 15) if above[c] == '#'}
    row = ['#'] * 15

    def rec(start_col, runs_left):
        if runs_left == 0:
            if col14_black and row[14] != '#': return False
            if (not col14_black) and row[14] != '.': return False
            return True
        starts = []
        if start_col == 0 and not col0_black:
            starts.append(0)
        for c in range(max(start_col, 1), 13):
            if c in allowed:
                starts.append(c)
        rng.shuffle(starts)
        for s in starts:
            min_tail = (runs_left - 1) * 4
            opts = list(range(3, 15 - s + 1))
            rng.shuffle(opts)
            for L in opts:
                end = s + L - 1
                if end > 14: continue
                if runs_left == 1:
                    if not col14_black and end != 14: continue
                    if col14_black and end > 13: continue
                else:
                    if end + 1 + min_tail > 14: continue
                    if end >= 14: continue
                for c in range(s, end + 1): row[c] = '.'
                next_start = end + 2 if runs_left > 1 else 15
                if rec(next_start, runs_left - 1): return True
                for c in range(s, end + 1): row[c] = '#'
        return False

    if col0_black: row[0] = '#'
    ok = rec(0, a_r)
    if not ok: return None
    if col0_black and row[0] != '#': return None
    if (not col0_black) and row[0] != '.': return None
    return row

def build_clean(a, col0black, rng):
    col0set = set(col0black)
    g = [None] * 15
    for r in range(8):
        above = g[r - 1] if r >= 1 else None
        c0 = r in col0set
        c14 = (14 - r) in col0set
        if r == 7:
            row = None
            for _ in range(60):
                cand = gen_row(above, a[r], c0, c14, rng)
                if cand is None: continue
                if all(cand[c] == cand[14 - c] for c in range(15)):
                    row = cand
                    break
        else:
            row = gen_row(above, a[r], c0, c14, rng)
        if row is None: return None
        g[r] = row
    for r in range(8, 15):
        src = g[14 - r]
        g[r] = [src[14 - c] for c in range(15)]
    return g

def main():
    rng = random.Random(42)
    with open(_DATA_DIR / 'skeletons.json') as f:
        skeletons = json.load(f)
    skeletons = [s for s in skeletons if s['a'][0] >= 2]

    error_counts = {}
    built = 0
    for _ in range(200000):
        sk = rng.choice(skeletons)
        g = build_clean(sk['a'], sk['col0black'], rng)
        if g is None: continue
        built += 1
        errs = xword.validate_structure(g)
        if not errs:
            n_across = len(xword.across_slots(g))
            print(f"VALID grid found! across_slots={n_across}")
            if n_across == 30:
                print("PERFECT MATCH!")
                for row in g: print(''.join(row))
                return
            continue
        for e in errs:
            key = e.split()[0:3]
            key = ' '.join(key)
            error_counts[key] = error_counts.get(key, 0) + 1
        if built <= 5:
            print(f"\nGrid #{built}:")
            for row in g: print(''.join(row))
            print(f"Errors ({len(errs)}):")
            for e in errs[:10]: print(f"  {e}")
            if len(errs) > 10: print(f"  ... and {len(errs)-10} more")

    print(f"\nBuilt: {built}")
    print("Error category counts:")
    for k, v in sorted(error_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

if __name__ == '__main__':
    main()
