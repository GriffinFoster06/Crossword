#!/usr/bin/env python3
"""
Crossword construction library.
- Loads a scored crossword word list.
- Grid utilities: slot extraction, validation, numbering, acrostic baking.
- A correct recursive backtracking filler (MRV + forward checking + lazy domain cache).
"""

import random
import time
from collections import defaultdict
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
WORDLIST_PATH = _REPO_ROOT / 'data' / 'raw' / 'crossword_words.dict'


# ─── Word database ───────────────────────────────────────────────────────────

class WordDB:
    def __init__(self, min_score=50, path=WORDLIST_PATH):
        self.by_len = defaultdict(list)        # len -> [word, ...] sorted by score desc
        self.score = {}                        # word -> score
        # (len, pos, char) -> set of indices into by_len[len]
        self.index = defaultdict(set)
        self._load(min_score, path)
        self._build_index()

    def _load(self, min_score, path):
        tmp = defaultdict(list)  # len -> [(score, word)]
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or ';' not in line:
                    continue
                word, sc = line.rsplit(';', 1)
                try:
                    sc = int(sc)
                except ValueError:
                    continue
                if sc < min_score:
                    continue
                word = word.upper()
                if not word.isalpha() or not (3 <= len(word) <= 15):
                    continue
                if word in self.score:
                    if sc > self.score[word]:
                        self.score[word] = sc
                        # Update already-appended entry so sort order stays consistent.
                        lst = tmp[len(word)]
                        for idx in range(len(lst) - 1, -1, -1):
                            if lst[idx][1] == word:
                                lst[idx] = (sc, word)
                                break
                    continue
                self.score[word] = sc
                tmp[len(word)].append((sc, word))
        self.windex = {}  # word -> index within by_len[len(word)]
        for L, lst in tmp.items():
            lst.sort(key=lambda x: (-x[0], x[1]))
            self.by_len[L] = [w for _, w in lst]
            for i, w in enumerate(self.by_len[L]):
                self.windex[w] = i

    def _build_index(self):
        for L, words in self.by_len.items():
            idx = self.index
            for i, w in enumerate(words):
                for p, ch in enumerate(w):
                    idx[(L, p, ch)].add(i)

    def total(self):
        return sum(len(v) for v in self.by_len.values())

    def match_indices(self, length, constraints):
        """Return set of indices into by_len[length] matching constraints
        [(pos,char),...]. None-fast on impossible."""
        if length not in self.by_len:
            return set()
        if not constraints:
            return set(range(len(self.by_len[length])))
        # Order by selectivity (smallest index set first)
        sets = []
        for pos, ch in constraints:
            s = self.index.get((length, pos, ch))
            if not s:
                return set()
            sets.append(s)
        sets.sort(key=len)
        result = set(sets[0])
        for s in sets[1:]:
            result &= s
            if not result:
                return set()
        return result


# ─── Grid utilities ──────────────────────────────────────────────────────────

def parse_grid(rows):
    g = [list(r) for r in rows]
    if len(g) != 15 or any(len(r) != 15 for r in g):
        raise ValueError("Grid must be 15x15")
    return g


def across_slots(grid):
    """Across slots in reading order: list of (r, c, length)."""
    H = len(grid)
    W = len(grid[0])
    out = []
    for r in range(H):
        c = 0
        while c < W:
            if grid[r][c] != '#':
                s = c
                while c < W and grid[r][c] != '#':
                    c += 1
                if c - s >= 3:
                    out.append((r, s, c - s))
            else:
                c += 1
    return out


def down_slots(grid):
    """Down slots: list of (r, c, length)."""
    H = len(grid)
    W = len(grid[0])
    out = []
    for c in range(W):
        r = 0
        while r < H:
            if grid[r][c] != '#':
                s = r
                while r < H and grid[r][c] != '#':
                    r += 1
                if r - s >= 3:
                    out.append((s, c, r - s))
            else:
                r += 1
    return out


def slot_cells(slot, direction):
    r, c, L = slot
    if direction == 'A':
        return [(r, c + i) for i in range(L)]
    return [(r + i, c) for i in range(L)]


def number_grid(grid):
    """Return {(r,c): number} per NYT convention."""
    H = len(grid)
    W = len(grid[0])
    numbers = {}
    n = 1
    for r in range(H):
        for c in range(W):
            if grid[r][c] == '#':
                continue
            starts_a = (c == 0 or grid[r][c-1] == '#') and c+1 < W and grid[r][c+1] != '#'
            starts_d = (r == 0 or grid[r-1][c] == '#') and r+1 < H and grid[r+1][c] != '#'
            if starts_a or starts_d:
                numbers[(r, c)] = n
                n += 1
    return numbers


def validate_structure(grid):
    """Check NYT structural rules. Returns list of error strings (empty == valid)."""
    errors = []
    # 180 symmetry
    for r in range(15):
        for c in range(15):
            if (grid[r][c] == '#') != (grid[14-r][14-c] == '#'):
                errors.append(f"symmetry at ({r},{c})")
                break
    # min word length: no white run of length 1 or 2
    for r in range(15):
        c = 0
        while c < 15:
            if grid[r][c] != '#':
                s = c
                while c < 15 and grid[r][c] != '#':
                    c += 1
                if c - s in (1, 2):
                    errors.append(f"short across run row {r} cols {s}-{c-1}")
            else:
                c += 1
    for c in range(15):
        r = 0
        while r < 15:
            if grid[r][c] != '#':
                s = r
                while r < 15 and grid[r][c] != '#':
                    r += 1
                if r - s in (1, 2):
                    errors.append(f"short down run col {c} rows {s}-{r-1}")
            else:
                r += 1
    # connectivity
    whites = [(r, c) for r in range(15) for c in range(15) if grid[r][c] != '#']
    if whites:
        seen = {whites[0]}
        stack = [whites[0]]
        while stack:
            r, c = stack.pop()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < 15 and 0 <= nc < 15 and grid[nr][nc] != '#' and (nr, nc) not in seen:
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        if len(seen) != len(whites):
            errors.append(f"disconnected: {len(seen)}/{len(whites)} reachable")
    # every white cell checked (in both an across and down word of len>=3)
    a_cells = set()
    for s in across_slots(grid):
        a_cells.update(slot_cells(s, 'A'))
    d_cells = set()
    for s in down_slots(grid):
        d_cells.update(slot_cells(s, 'D'))
    for (r, c) in whites:
        if (r, c) not in a_cells:
            errors.append(f"unchecked (no across) at ({r},{c})")
        if (r, c) not in d_cells:
            errors.append(f"unchecked (no down) at ({r},{c})")
    return errors


# ─── Filler ──────────────────────────────────────────────────────────────────
#
# Slot-CSP solver with incremental arc-consistency propagation driven by
# per-slot / per-position feasible-letter counts (the Qxw filler.c design,
# as recommended by the autofill survey). Either fills fast or fails fast.

class Filler:
    def __init__(self, grid, db, acrostic):
        self.grid = [row[:] for row in grid]
        self.db = db
        self.acrostic = acrostic

        self.aslots = across_slots(grid)
        self.dslots = down_slots(grid)
        assert len(self.aslots) == len(acrostic), \
            f"{len(self.aslots)} across slots but acrostic len {len(acrostic)}"

        # Unified slot list: (direction, r, c, L)
        self.slots = [('A', r, c, L) for (r, c, L) in self.aslots] + \
                     [('D', r, c, L) for (r, c, L) in self.dslots]
        self.nslots = len(self.slots)
        self.lens = [s[3] for s in self.slots]
        self.cells = [slot_cells((r, c, L), d) for (d, r, c, L) in self.slots]

        # cell -> [(slot_idx, pos)]
        self.cell_slots = defaultdict(list)
        for si, cells in enumerate(self.cells):
            for pos, cell in enumerate(cells):
                self.cell_slots[cell].append((si, pos))

        # crossings[si] = list of (pos_in_si, other_slot, pos_in_other)
        self.crossings = [[] for _ in range(self.nslots)]
        for si, cells in enumerate(self.cells):
            for pos, cell in enumerate(cells):
                for (oj, opos) in self.cell_slots[cell]:
                    if oj != si:
                        self.crossings[si].append((pos, oj, opos))

        # Fixed cells from the acrostic: first cell of each across slot.
        self.fixed = {}  # (r,c) -> letter
        for i, (r, c, L) in enumerate(self.aslots):
            self.fixed[(r, c)] = acrostic[i]

        # word index -> word string, per length (reference to db.by_len)
        self.words = db.by_len

        # Per-slot domains (sets of word indices) + per-position letter counts.
        # cnt[si][p] is a dict {ch: count of remaining words with ch at p}.
        self.dom = [None] * self.nslots
        self.cnt = [None] * self.nslots
        self.assigned = [None] * self.nslots   # word string once fully chosen
        self.used = set()                      # placed word strings (dup check)

        # Reversal trail: list of (si, word_idx) removed from dom[si].
        self.trail = []

        self.nodes = 0
        self.deadline = None
        self.dead = False

        self._init_domains()

    # -- domain initialization --
    def _init_domains(self):
        db = self.db
        for si in range(self.nslots):
            L = self.lens[si]
            cons = []
            for pos, cell in enumerate(self.cells[si]):
                if cell in self.fixed:
                    cons.append((pos, self.fixed[cell]))
            idxset = db.match_indices(L, cons)
            dom = set(idxset)
            self.dom[si] = dom
            words = self.words[L]
            cnt = [defaultdict(int) for _ in range(L)]
            for wi in dom:
                w = words[wi]
                for p in range(L):
                    cnt[p][w[p]] += 1
            self.cnt[si] = cnt
            if not dom:
                self.dead = True
        if not self.dead:
            # Propagate to a fixpoint from every slot so cross-slot
            # contradictions (e.g. two singletons clashing) are caught.
            if not self.propagate(list(range(self.nslots))):
                self.dead = True

    # -- low-level domain edit (trailed) --
    def _remove(self, si, wi):
        """Remove word index wi from dom[si]; update counts; record on trail."""
        self.dom[si].discard(wi)
        w = self.words[self.lens[si]][wi]
        cnt = self.cnt[si]
        for p in range(self.lens[si]):
            cnt[p][w[p]] -= 1
        self.trail.append((si, wi))

    def _restore_to(self, mark):
        words = self.words
        while len(self.trail) > mark:
            si, wi = self.trail.pop()
            self.dom[si].add(wi)
            w = words[self.lens[si]][wi]
            cnt = self.cnt[si]
            for p in range(self.lens[si]):
                cnt[p][w[p]] += 1

    # -- arc consistency --
    def propagate(self, queue):
        """AC-3 over slot domains using per-position feasible-letter counts.
        Returns False if any domain becomes empty."""
        inq = set(queue)
        dq = list(queue)
        words = self.words
        while dq:
            si = dq.pop()
            inq.discard(si)
            cntj = self.cnt[si]
            domsi = self.dom[si]
            if not domsi:
                return False
            for (pos, oj, opos) in self.crossings[si]:
                # letters feasible at this cell from si's side
                allowed = cntj[pos]
                domk = self.dom[oj]
                cntk = self.cnt[oj]
                wk = words[self.lens[oj]]
                # remove words in oj whose letter at opos lacks support in si
                bad = [wi for wi in domk
                       if allowed.get(wk[wi][opos], 0) == 0]
                if not bad:
                    continue
                for wi in bad:
                    self._remove(oj, wi)
                if not self.dom[oj]:
                    return False
                if oj not in inq:
                    inq.add(oj)
                    dq.append(oj)
        return True

    # -- search --
    def _select(self):
        """MRV: unfilled slot with smallest domain; tie-break by more
        crossings then longer length."""
        best = None
        best_key = None
        for si in range(self.nslots):
            if self.assigned[si] is not None:
                continue
            n = len(self.dom[si])
            key = (n, -len(self.crossings[si]), -self.lens[si])
            if best_key is None or key < best_key:
                best, best_key = si, key
                if n <= 1:
                    if n == 0:
                        return si
        return best

    def _lcv_score(self, si, wi):
        """Least-constraining value: sum of remaining domain sizes in crossing
        slots after hypothetically placing word wi in slot si.  Higher is better
        (leaves more room for neighbours).  Cheap approximation: count words in
        each crossing slot whose letter at the shared cell matches the letter
        wi places there — using the prebuilt cnt arrays, no domain mutation."""
        w = self.words[self.lens[si]][wi]
        total = 0
        for (pos, oj, opos) in self.crossings[si]:
            if self.assigned[oj] is not None:
                continue
            ch = w[pos]
            total += self.cnt[oj][opos].get(ch, 0)
        return total

    def _ordered_words(self, si, jitter):
        sc = self.db.score
        words = self.words[self.lens[si]]
        used = self.used
        cand = [(words[wi], wi) for wi in self.dom[si] if words[wi] not in used]
        if not cand:
            return []
        # Combined score: quality score + LCV support + jitter
        scored = []
        for (w, wi) in cand:
            q = sc.get(w, 50)
            lcv = self._lcv_score(si, wi)
            j = random.random() * jitter if jitter else 0
            scored.append((w, wi, q + lcv * 0.1 + j))
        scored.sort(key=lambda x: -x[2])
        return [(w, wi) for (w, wi, _) in scored]

    def solve(self, time_limit=60, jitter=8.0):
        if self.dead:
            return False
        self.deadline = time.time() + time_limit
        self.nodes = 0
        return self._search(jitter)

    def _search(self, jitter):
        if time.time() > self.deadline:
            return False
        si = self._select()
        if si is None:
            self._writeback()
            return True
        if len(self.dom[si]) == 0:
            return False
        self.nodes += 1
        for (word, wi) in self._ordered_words(si, jitter):
            if word in self.used:
                continue
            mark = len(self.trail)
            # collapse dom[si] to the single chosen word
            for other in list(self.dom[si]):
                if other != wi:
                    self._remove(si, other)
            self.assigned[si] = word
            self.used.add(word)
            ok = self.propagate([si])
            if ok and self._search(jitter):
                return True
            self.assigned[si] = None
            self.used.discard(word)
            self._restore_to(mark)
            if time.time() > self.deadline:
                return False
        return False

    def _writeback(self):
        """Write the solved single-word domains into self.grid."""
        for si in range(self.nslots):
            dom = self.dom[si]
            w = self.assigned[si]
            if w is None and len(dom) == 1:
                w = self.words[self.lens[si]][next(iter(dom))]
            if w is None:
                continue
            for pos, (r, c) in enumerate(self.cells[si]):
                self.grid[r][c] = w[pos]

    # -- results --
    def entries(self):
        numbers = number_grid(self.grid)
        ac = []
        for (r, c, L) in self.aslots:
            w = ''.join(self.grid[r][c+i] for i in range(L))
            ac.append((numbers[(r, c)], w))
        dn = []
        for (r, c, L) in self.dslots:
            w = ''.join(self.grid[r+i][c] for i in range(L))
            dn.append((numbers[(r, c)], w))
        return ac, dn, numbers

    def show(self):
        for row in self.grid:
            print('  ' + ''.join('█' if ch == '#'
                                  else ('·' if ch == '.' else ch)
                                  for ch in row))


def feasibility(grid, db, acrostic):
    """Build a Filler and propagate to a fixpoint. Returns (ok, report).
    ok is False if the grid is provably unfillable (some slot's domain emptied
    after arc consistency), catching cross-slot contradictions that a per-slot
    independence check would miss."""
    f = Filler(grid, db, acrostic)
    if f.dead:
        bad = []
        for si in range(f.nslots):
            if not f.dom[si]:
                d, r, c, L = f.slots[si]
                bad.append((f"{d} r{r} c{c} L{L}", L))
        return False, (bad or [("propagation", 0)])
    return True, []
