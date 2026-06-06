#!/usr/bin/env python3
"""
Find per-row across-count vectors a[0..14] (palindromic, sum 30) and column-0
black patterns so the FORCED column-0 down-words (acrostic letters) are all valid.
Rank by: fewest 15-letter rows (a[r]==1), then best avg column-0 word score.
"""

import sys
import json
from itertools import product
sys.path.insert(0, '/home/user/Crossword/scripts')
import xword

ACROSTIC = "TOBEORNOTTOBETHATISTHEQUESTION"


def all_symmetric_col_patterns():
    """All symmetric (r in set <-> 14-r in set) black-row subsets of {0..14}
    whose white runs are all length >= 3 (and not all-black)."""
    patterns = []
    # free choice on rows 0..7 (row 7 self-paired); rows 8..14 mirror
    for bits in product((0, 1), repeat=8):
        s = set()
        for i in range(8):
            if bits[i]:
                s.add(i)
                s.add(14 - i)
        # check runs >=3
        runs_valid = True
        r = 0
        while r < 15:
            if r in s:
                r += 1
                continue
            start = r
            while r < 15 and r not in s:
                r += 1
            if r - start < 3:
                runs_valid = False
                break
        if runs_valid and len(s) < 15:
            patterns.append(tuple(sorted(s)))
    return sorted(set(patterns))


def col0_words(a, black_rows):
    S = [0] * 16
    for r in range(15):
        S[r + 1] = S[r] + a[r]
    words = []
    r = 0
    while r < 15:
        if r in black_rows:
            r += 1
            continue
        s = r
        while r < 15 and r not in black_rows:
            r += 1
        if r - s >= 3:
            words.append((s, r - 1, ''.join(ACROSTIC[S[rr]] for rr in range(s, r))))
        else:
            return None
    return words


def main():
    db = xword.WordDB(min_score=50)
    score = db.score
    wordset = set(score.keys())

    patterns = all_symmetric_col_patterns()
    print(f"{len(patterns)} symmetric column-0 patterns with valid run lengths")

    found = []
    for half in product((1, 2, 3), repeat=8):
        if 2 * sum(half[:7]) + half[7] != 30:
            continue
        a = list(half) + [half[6 - i] for i in range(7)]
        if a != a[::-1] or sum(a) != 30:
            continue
        ones = a.count(1)
        for pat in patterns:
            cw = col0_words(a, set(pat))
            if cw is None:
                continue
            if all(w in wordset for (_, _, w) in cw):
                avg = sum(score[w] for (_, _, w) in cw) / len(cw)
                minsc = min(score[w] for (_, _, w) in cw)
                found.append((ones, -minsc, -avg, a, pat, [w for _, _, w in cw]))

    found.sort()
    print(f"Found {len(found)} feasible skeletons.\n")
    print("Top 30 (ranked by fewest 15-letter rows, then col0 word quality):")
    for ones, nmin, navg, a, pat, words in found[:30]:
        print(f"  ones={ones} minScore={-nmin} avg={-navg:.0f}  col0={' '.join(words)}")
        print(f"      a={a} black={pat}")

    with open('/home/user/Crossword/data/raw/skeletons.json', 'w') as f:
        json.dump([{'a': a, 'col0black': list(pat), 'col0words': words,
                    'ones': ones, 'minscore': -nmin}
                   for ones, nmin, navg, a, pat, words in found], f)
    print(f"\nSaved {len(found)} skeletons to data/raw/skeletons.json")


if __name__ == '__main__':
    main()
