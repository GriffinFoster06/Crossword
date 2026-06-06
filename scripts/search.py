#!/usr/bin/env python3
"""
High-throughput grid search for the Shakespeare acrostic.

Pipeline per candidate grid:
  1. build_grid (skeleton) -> structurally valid symmetric 30-across grid
  2. fast per-slot init feasibility: every across/down slot must have >=1
     dictionary word matching its acrostic-forced letters (cheap: match_indices,
     no engine build). Kills ~299/300 grids in microseconds.
  3. AC-3 alive check (Filler init runs arc consistency to a fixpoint)
  4. Domain quality filter: skip grids where min domain size after AC-3 < threshold
  5. full fill (Filler.solve)

Reports throughput stats so we can see where candidates die.
"""

import sys
import json
import random
import math
import time
sys.path.insert(0, '/home/user/Crossword/scripts')
import xword
from solve_skeleton import build_grid

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"


def fixed_cells(g):
    return {(r, c): ACROSTIC[i]
            for i, (r, c, L) in enumerate(xword.across_slots(g))}


def init_feasible(g, fx, db):
    """Every slot must have >=1 word matching its acrostic-forced letters."""
    for (r, c, L) in xword.across_slots(g):
        if not db.match_indices(L, [(0, fx[(r, c)])]):
            return False
    for (r, c, L) in xword.down_slots(g):
        cons = []
        for i in range(L):
            cell = (r + i, c)
            if cell in fx:
                cons.append((i, fx[cell]))
        if cons and not db.match_indices(L, cons):
            return False
    return True


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    budget = float(sys.argv[2]) if len(sys.argv) > 2 else 240
    min_score = int(sys.argv[3]) if len(sys.argv) > 3 else 45
    # min_dom: skip alive grids where smallest domain after AC-3 is < this value.
    # 1 = accept any alive grid (singletons are unavoidable due to acrostic).
    min_dom = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    rng = random.Random(seed)

    db = xword.WordDB(min_score=min_score)
    print(f"DB: {db.total()} words (min_score={min_score})", flush=True)
    skeletons = json.load(open('/home/user/Crossword/data/raw/skeletons.json'))
    skeletons = [s for s in skeletons if s['a'][0] >= 2]
    skeletons.sort(key=lambda s: (s['ones'], -s['minscore']))
    print(f"{len(skeletons)} candidate skeletons", flush=True)

    t0 = time.time()
    v30 = initok = alive = fill_attempts = 0
    while time.time() - t0 < budget:
        sk = rng.choice(skeletons)
        g = build_grid(sk['a'], sk['col0black'], rng)
        if g is None:
            continue
        if xword.validate_structure(g):
            continue
        if len(xword.across_slots(g)) != 30:
            continue
        v30 += 1
        fx = fixed_cells(g)
        if not init_feasible(g, fx, db):
            continue
        initok += 1
        f = xword.Filler(g, db, ACROSTIC)
        if f.dead:
            continue
        # Domain quality filter: skip grids too tightly constrained after AC-3.
        # Singletons everywhere usually mean the grid is a dead end for the filler.
        dom_sizes = [len(f.dom[si]) for si in range(f.nslots) if f.assigned[si] is None]
        if dom_sizes and min(dom_sizes) < min_dom:
            continue
        alive += 1
        score = sum(math.log(max(s, 1)) for s in dom_sizes)
        print(f"\n[{time.time()-t0:.0f}s] ALIVE #{alive} "
              f"(v30={v30} initok={initok}) a={sk['a']} col0={sk['col0words']} "
              f"min_dom={min(dom_sizes) if dom_sizes else 0} score={score:.1f}. "
              f"Filling...", flush=True)
        fill_attempts += 1
        if f.solve(time_limit=45, jitter=8.0):
            print(f"*** FILLED ({f.nodes} nodes) ***", flush=True)
            f.show()
            ac_e, dn_e, _ = f.entries()
            acr = ''.join(w[0] for _, w in ac_e)
            print("Acrostic:", acr)
            allw = [w for _, w in ac_e] + [w for _, w in dn_e]
            ok = (acr == ACROSTIC and not xword.validate_structure(f.grid)
                  and len(set(allw)) == len(allw))
            print("VALID PUZZLE:", ok)
            json.dump({'grid': [''.join(r) for r in f.grid], 'seed': seed,
                       'min_score': min_score, 'skeleton': sk['a']},
                      open('/home/user/Crossword/data/raw/working_grid.json', 'w'),
                      indent=2)
            print("Saved working_grid.json", flush=True)
            if ok:
                return
        else:
            print(f"  fill failed ({f.nodes} nodes)", flush=True)
        if alive % 10 == 0:
            print(f"  [{time.time()-t0:.0f}s] v30={v30} initok={initok} "
                  f"alive={alive} attempts={fill_attempts}", flush=True)

    print(f"\nDONE budget. v30={v30} initok={initok} alive={alive} "
          f"attempts={fill_attempts} ({time.time()-t0:.0f}s)", flush=True)


if __name__ == '__main__':
    main()
