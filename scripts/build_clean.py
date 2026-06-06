#!/usr/bin/env python3
"""
Construct valid symmetric 15x15 grids with exactly 30 across entries that satisfy
the acrostic-friendliness invariant:

    every across-entry start in a column c>0 has a black square directly above it.

Rationale (proved empirically with the AC-3 engine): the only way an acrostic
forced first-letter can stack into an impossible down-word substring is when an
across word starts mid-row with white above it (so its forced letter lands in the
interior of a down word). Forcing a black above every mid-row start makes each
such forced letter the FIRST letter of a down word ("Q..." etc. — always
satisfiable). Column-0 down words are fully forced by the acrostic and are
validated separately by the skeleton (find_skeleton.py).

Construction is row-by-row, top-down, honoring the skeleton's per-row across
counts a[] and its symmetric column-0 black pattern. Rows 0..7 are built so each
run start (c>0) sits under a black in the row above; rows 8..14 are the 180°
mirror. The full grid is then structurally validated.
"""

import sys
import json
import random
import time
sys.path.insert(0, '/home/user/Crossword/scripts')
import xword

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"


def gen_row(above, a_r, col0_black, col14_black, rng):
    """Build one row (list of 15 '.'/'#') with exactly a_r white runs (each >=3),
    where every run start at column c>0 has above[c]=='#'. above is None for the
    top row (no invariant). Returns a row or None."""
    # Allowed start columns for a run beginning at c>0.
    if above is None:
        allowed = set(range(1, 15))           # row 0: any interior start
    else:
        allowed = {c for c in range(1, 15) if above[c] == '#'}

    row = ['#'] * 15
    order_cache = {}

    def rec(start_col, runs_left):
        # Fill columns [start_col..14] with runs_left runs, then trailing blacks.
        if runs_left == 0:
            # all remaining cells already black; col14 must match requirement
            if col14_black and row[14] != '#':
                return False
            if (not col14_black) and row[14] != '.':
                return False
            return True
        # choose this run's start s and length L
        # first run may start at 0 iff col0 is white
        starts = []
        if start_col == 0 and not col0_black:
            starts.append(0)
        for c in range(max(start_col, 1), 13):
            if c == 0:
                continue
            # need a black immediately to the left (separator) — guaranteed since
            # everything before is black by default; but ensure col0 status ok
            if c in allowed:
                starts.append(c)
        rng.shuffle(starts)
        for s in starts:
            # length options, leaving room for remaining runs (each >=3 + 1 gap)
            min_tail = (runs_left - 1) * 4  # each further run >=3 plus >=1 gap
            for L in _len_order(s, runs_left, col14_black, rng):
                end = s + L - 1
                if end > 14:
                    continue
                # if this is the last run and col14 must be white, it must end at 14
                if runs_left == 1:
                    if not col14_black and end != 14:
                        continue
                    if col14_black and end > 13:
                        continue
                else:
                    # must leave >=1 black gap then min_tail
                    if end + 1 + min_tail > 14:
                        continue
                    if end >= 14:
                        continue
                # paint run white
                for c in range(s, end + 1):
                    row[c] = '.'
                next_start = end + 2  # at least one black gap
                if rec(next_start if runs_left > 1 else 15, runs_left - 1):
                    return True
                for c in range(s, end + 1):
                    row[c] = '#'
        return False

    # col0 status
    if col0_black:
        row[0] = '#'
    ok = rec(0, a_r)
    if not ok:
        return None
    # enforce col0/col14 final status
    if col0_black and row[0] != '#':
        return None
    if (not col0_black) and row[0] != '.':
        return None
    return row


def _len_order(s, runs_left, col14_black, rng):
    """Reasonable run lengths to try, longer-biased, shuffled a bit."""
    hi = 15 - s
    opts = list(range(3, hi + 1))
    rng.shuffle(opts)
    return opts


def build_clean(a, col0black, rng):
    col0set = set(col0black)
    g = [None] * 15
    for r in range(8):
        above = g[r - 1] if r >= 1 else None
        c0 = r in col0set
        c14 = (14 - r) in col0set
        if r == 7:
            # row 7 is self-symmetric: require a palindromic black pattern
            row = None
            for _ in range(60):
                cand = gen_row(above, a[r], c0, c14, rng)
                if cand is None:
                    continue
                if all(cand[c] == cand[14 - c] for c in range(15)):
                    row = cand
                    break
        else:
            row = gen_row(above, a[r], c0, c14, rng)
        if row is None:
            return None
        g[r] = row
    for r in range(8, 15):
        src = g[14 - r]
        g[r] = [src[14 - c] for c in range(15)]
    return g


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    budget = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    min_score = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    rng = random.Random(seed)

    db = xword.WordDB(min_score=min_score)
    print(f"DB: {db.total()} words (min_score={min_score})")
    skeletons = json.load(open('/home/user/Crossword/data/raw/skeletons.json'))
    skeletons = [s for s in skeletons if s['a'][0] >= 2]
    skeletons.sort(key=lambda s: (s['ones'], -s['minscore']))
    print(f"{len(skeletons)} candidate skeletons")

    t0 = time.time()
    built = v30 = alive = 0
    while time.time() - t0 < budget:
        sk = rng.choice(skeletons)
        g = build_clean(sk['a'], sk['col0black'], rng)
        if g is None:
            continue
        built += 1
        if xword.validate_structure(g):
            continue
        if len(xword.across_slots(g)) != 30:
            continue
        v30 += 1
        f = xword.Filler(g, db, ACROSTIC)
        if f.dead:
            continue
        alive += 1
        print(f"\n[{time.time()-t0:.0f}s] ALIVE #{alive} (built={built} v30={v30}) "
              f"a={sk['a']} col0={sk['col0words']}. Filling...", flush=True)
        if f.solve(time_limit=30, jitter=8.0):
            print(f"*** FILLED ({f.nodes} nodes) ***")
            f.show()
            ac_e, dn_e, _ = f.entries()
            acr = ''.join(w[0] for _, w in ac_e)
            print("Acrostic:", acr)
            ok = (acr == ACROSTIC) and not xword.validate_structure(f.grid)
            allw = [w for _, w in ac_e] + [w for _, w in dn_e]
            ok = ok and len(set(allw)) == len(allw)
            print("VALID PUZZLE:", ok)
            json.dump({'grid': [''.join(row) for row in f.grid], 'seed': seed,
                       'min_score': min_score},
                      open('/home/user/Crossword/data/raw/working_grid.json', 'w'),
                      indent=2)
            print("Saved working grid.")
            return
        else:
            print(f"  fill failed ({f.nodes} nodes)", flush=True)

    print(f"\nNo fill. built={built} v30={v30} alive={alive} in {time.time()-t0:.0f}s")


if __name__ == '__main__':
    main()
